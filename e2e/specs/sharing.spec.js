import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { ensureUser, fetchShares, fetchIsPublic } from '../helpers/api.js'

// Sharing had no browser coverage. The Python side is well covered (7 tests on
// DocShare + the custom "comment" permission type), but the DIALOG is the part with
// the bad history: it was wired to `draw.api.diagram.*` methods that did not exist,
// so inviting someone silently did nothing until #13 repointed it at
// `draw.api.share.*`. Unit tests could not have caught that and neither could the
// Python tests — only driving the real dialog can.
//
// So every assertion here reads the PERSISTED share rows back, never the list the
// dialog is rendering: a dialog that shows a member it failed to save is exactly
// the failure mode.

const TARGET = 'e2e-share-target@example.com'

// The dialog's dropdowns are addressed by their accessible label, not by position.
// Positional locators (`select` .first()/.nth(1)/.last()) silently target the wrong
// control the moment the dialog gains one — and the selects had no label at all
// until this spec needed them, which was an accessibility gap in its own right.

async function openShareDialog(page) {
  // `exact` because the fixture titles each document after its test, and a test
  // whose name contains "share" would otherwise match the title button too.
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  // The heading was renamed to `Sharing "<name>"` (Writer-style, #106), so the old
  // "Share diagram" text is gone. Wait on the general-access trigger instead: one
  // stable element that is present only once the dialog has actually opened.
  await expect(page.getByTestId('general-access-trigger')).toBeVisible()
}

// Invite by typing the address and picking the search result.
async function invite(page, email, level) {
  if (level) await page.getByLabel('Access level for the person being added').selectOption(level)
  await page.getByPlaceholder('Add people by email…').fill(email)
  const result = page.getByRole('button', { name: new RegExp(email, 'i') }).first()
  await result.waitFor({ state: 'visible' })
  await result.click()
}

// The row for `email` in the members list, and its level dropdown.
function memberRow(page, email) {
  return page.locator('div').filter({ hasText: new RegExp(`^${email}$`) }).first()
}

// General access is a Writer-style tier menu now (#106), not a <select>: click the
// trigger to open the tier list, then pick the tier by its stable test id. The tiers
// are 'restricted' | 'site_users_view' | 'public_view' — the old two-state
// 'link'/'restricted' select is gone. The trigger carries the live tier as its
// data-value, so a caller can wait on it once a change has round-tripped.
async function setGeneralAccess(page, tier) {
  await page.getByTestId('general-access-trigger').click()
  await page.getByTestId(`general-access-option-${tier}`).click()
}

test.describe('sharing: inviting people', () => {
  for (const level of ['view', 'comment', 'edit']) {
    test(`an invite at "${level}" is persisted as a share at that level`, async ({
      page,
      diagram,
    }) => {
      const name = await diagram.open('unified')
      await ensureUser(page, TARGET)

      await openShareDialog(page)
      await invite(page, TARGET, level)

      await expect
        .poll(async () => (await fetchShares(page, name)).find((s) => s.user === TARGET)?.level, {
          message: `inviting at "${level}" did not persist a share`,
          timeout: 20_000,
        })
        .toBe(level)
    })
  }

  test('the invited person appears in the members list', async ({ page, diagram }) => {
    await diagram.open('unified')
    await ensureUser(page, TARGET)

    await openShareDialog(page)
    await invite(page, TARGET, 'edit')

    await expect(memberRow(page, TARGET), 'the invited member did not render').toBeVisible()
  })

  test('changing a member level updates the persisted share', async ({ page, diagram }) => {
    const name = await diagram.open('unified')
    await ensureUser(page, TARGET)

    await openShareDialog(page)
    await invite(page, TARGET, 'view')
    await expect
      .poll(async () => (await fetchShares(page, name)).find((s) => s.user === TARGET)?.level, {
        timeout: 20_000,
      })
      .toBe('view')

    await page.getByLabel(`Access level for ${TARGET}`).selectOption('edit')

    await expect
      .poll(async () => (await fetchShares(page, name)).find((s) => s.user === TARGET)?.level, {
        message: 'changing the level did not persist',
        timeout: 20_000,
      })
      .toBe('edit')
  })

  test('removing a member revokes the persisted share', async ({ page, diagram }) => {
    const name = await diagram.open('unified')
    await ensureUser(page, TARGET)

    await openShareDialog(page)
    await invite(page, TARGET, 'edit')
    await expect
      .poll(async () => (await fetchShares(page, name)).length, { timeout: 20_000 })
      .toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Remove' }).first().click()

    await expect
      .poll(async () => (await fetchShares(page, name)).some((s) => s.user === TARGET), {
        message: 'removing the member left the share in place',
        timeout: 20_000,
      })
      .toBe(false)
  })
})

test.describe('sharing: the public link', () => {
  test('switching to "anyone with the link" makes the diagram public', async ({ page, diagram }) => {
    const name = await diagram.open('unified')
    expect(await fetchIsPublic(page, name), 'a new diagram should not be public').toBe(0)

    await openShareDialog(page)
    await setGeneralAccess(page, 'public_view')

    await expect
      .poll(async () => fetchIsPublic(page, name), {
        message: 'the public-link setting did not persist',
        timeout: 20_000,
      })
      .toBe(1)
  })

  test('switching back to restricted makes it private again', async ({ page, diagram }) => {
    const name = await diagram.open('unified')
    const accessTrigger = page.getByTestId('general-access-trigger')

    await openShareDialog(page)
    await setGeneralAccess(page, 'public_view')
    // Wait for the DIALOG to catch up, not just the server. is_public flips as soon as
    // set_general_access commits, but the client is still inside its reload() at that
    // point — polling the API alone and switching straight back raced the reload and
    // made this flaky. The trigger reflects the public tier only once reload() has landed.
    await expect(accessTrigger).toHaveAttribute('data-value', 'public_view')
    await expect.poll(async () => fetchIsPublic(page, name), { timeout: 20_000 }).toBe(1)

    await setGeneralAccess(page, 'restricted')
    await expect
      .poll(async () => fetchIsPublic(page, name), {
        message: 'turning the public link off did not persist',
        timeout: 20_000,
      })
      .toBe(0)
  })

  test('switching on and straight back off ends up off', async ({ page, diagram }) => {
    // The change made while the first one is still in flight used to be DROPPED:
    // toggleGlobalAccess returned early while `updating` was true, so the diagram
    // stayed public and the control snapped back to public as though the second
    // pick had applied. Deliberately no wait between the two tier picks.
    const name = await diagram.open('unified')
    const accessTrigger = page.getByTestId('general-access-trigger')

    await openShareDialog(page)
    await setGeneralAccess(page, 'public_view')
    await setGeneralAccess(page, 'restricted')

    await expect
      .poll(async () => fetchIsPublic(page, name), {
        message: 'a change made mid-flight was dropped — the diagram is still public',
        timeout: 20_000,
      })
      .toBe(0)
    await expect(accessTrigger).toHaveAttribute('data-value', 'restricted')
  })

  test('a public diagram opens in the read-only viewer', async ({ page, diagram }) => {
    // The viewer route is guest-readable for public diagrams; this is the payoff of
    // the setting above, and the one part of sharing a user actually sees working.
    const name = await diagram.open('unified')
    await openShareDialog(page)
    await setGeneralAccess(page, 'public_view')
    await expect.poll(async () => fetchIsPublic(page, name), { timeout: 20_000 }).toBe(1)

    await page.goto(`/draw/view/${encodeURIComponent(name)}`)
    await expect(page.locator('svg').first()).toBeVisible()
  })
})

test.describe('sharing: hygiene', () => {
  test('opening and using the share dialog raises no uncaught errors', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    await diagram.open('unified')
    await ensureUser(page, TARGET)

    await openShareDialog(page)
    await invite(page, TARGET, 'comment')
    await setGeneralAccess(page, 'public_view')

    expect(errors.pageErrors, 'the share dialog raised an uncaught exception').toEqual([])
    expect(errors.failures, 'the share dialog made a request that failed').toEqual([])
  })
})
