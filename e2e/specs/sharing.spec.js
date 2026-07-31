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
  await expect(page.getByText('Share diagram')).toBeVisible()
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
    await page.getByLabel('General access').selectOption('link')

    await expect
      .poll(async () => fetchIsPublic(page, name), {
        message: 'the public-link setting did not persist',
        timeout: 20_000,
      })
      .toBe(1)
  })

  test('switching back to restricted makes it private again', async ({ page, diagram }) => {
    const name = await diagram.open('unified')
    const access = page.getByLabel('General access')

    await openShareDialog(page)
    await access.selectOption('link')
    // Wait for the DIALOG to catch up, not just the server. is_public flips as soon as
    // set_public commits, but the client is still inside its reload() at that point —
    // polling the API alone and switching straight back raced the reload and made this
    // test flaky. The select only reads 'link' once reload() has landed.
    await expect(access).toHaveValue('link')
    await expect.poll(async () => fetchIsPublic(page, name), { timeout: 20_000 }).toBe(1)

    await access.selectOption('restricted')
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
    // stayed public and the dropdown snapped back to "link" as though the second
    // click had applied. Deliberately no wait between the two selections.
    const name = await diagram.open('unified')
    const access = page.getByLabel('General access')

    await openShareDialog(page)
    await access.selectOption('link')
    await access.selectOption('restricted')

    await expect
      .poll(async () => fetchIsPublic(page, name), {
        message: 'a change made mid-flight was dropped — the diagram is still public',
        timeout: 20_000,
      })
      .toBe(0)
    await expect(access).toHaveValue('restricted')
  })

  test('a public diagram opens in the read-only viewer', async ({ page, diagram }) => {
    // The viewer route is guest-readable for public diagrams; this is the payoff of
    // the setting above, and the one part of sharing a user actually sees working.
    const name = await diagram.open('unified')
    await openShareDialog(page)
    await page.getByLabel('General access').selectOption('link')
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
    await page.getByLabel('General access').selectOption('link')

    expect(errors.pageErrors, 'the share dialog raised an uncaught exception').toEqual([])
    expect(errors.failures, 'the share dialog made a request that failed').toEqual([])
  })
})
