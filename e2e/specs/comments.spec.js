import { test, expect } from '../helpers/fixtures.js'

// Commenting end to end (#108, reworked in #424).
//
// The faults this covers were all in the seam between the UI and the server:
// deleting reported success and failure at the same time while the comment stayed
// on screen, the canvas carried a second live copy of the open thread, and every
// action waited for the round trip before showing anything. None of that is visible
// to a unit test of the store, so the whole flow runs here against a real backend.

const panel = (page) => page.locator('aside').filter({ hasText: 'Comments' })
const pins = (page) => page.getByRole('button', { name: /^Open comment thread/ })
// The Open / Resolved filter renders as a radio group (frappe-ui TabButtons), so
// its entries are radios rather than buttons.
const filterTab = (page, label) => panel(page).getByRole('radio', { name: label })

// Place a comment on empty canvas and post it.
async function addComment(page, text, { x = 520, y = 420 } = {}) {
  await page.getByRole('button', { name: 'Comments', exact: true }).click()
  await panel(page).getByRole('button', { name: 'Add comment' }).click()
  await page.mouse.click(x, y)
  const composer = page.getByPlaceholder('Add a comment…')
  await expect(composer).toBeVisible()
  await composer.fill(text)
  await page.getByRole('button', { name: 'Comment', exact: true }).click()
  await expect(panel(page).getByText(text)).toBeVisible()
}

test.describe('comments (#424)', () => {
  test('places a comment, and the canvas carries a pin rather than a second copy', async ({
    page,
    diagram,
  }) => {
    await diagram.open('unified', { empty: true })

    await addComment(page, 'Widen this column')

    await expect(pins(page), 'the comment left no pin to navigate back to').toHaveCount(1)

    // Clicking the pin focuses the thread in the panel. The canvas used to answer
    // with a full thread card — the same comment, live, in two places — which is
    // what left ghost copies behind while one of them was edited.
    await pins(page).first().click()
    await expect(panel(page).getByText('Widen this column')).toBeVisible()
    await expect(
      page.locator('.pointer-events-auto').getByRole('button', { name: 'Reply' }),
      'the canvas is still carrying comment controls',
    ).toHaveCount(0)
  })

  test('a reply shows in the thread and counts stay right through resolve', async ({ page, diagram }) => {
    await diagram.open('unified', { empty: true })
    await addComment(page, 'Needs a title')

    await panel(page).getByRole('button', { name: 'Reply', exact: true }).click()
    await page.getByPlaceholder('Reply…').fill('Agreed, adding one')
    await panel(page).getByRole('button', { name: 'Reply', exact: true }).last().click()
    await expect(panel(page).getByText('Agreed, adding one')).toBeVisible()

    await expect(filterTab(page, /^Open 1/)).toBeVisible()
    await panel(page).getByRole('button', { name: 'Resolve thread' }).click()

    // The thread leaves Open for Resolved, both counts move, and the pin goes with
    // it — a resolved thread is reachable from the panel, not from the board.
    await expect(filterTab(page, /^Open 0/)).toBeVisible()
    await expect(filterTab(page, /^Resolved 1/)).toBeVisible()
    await expect(pins(page)).toHaveCount(0)
  })

  test('deleting removes the comment and its pin, and says so once', async ({ page, diagram }) => {
    await diagram.open('unified', { empty: true })
    await addComment(page, 'Drop this note')

    await panel(page).getByRole('button', { name: 'Delete comment' }).first().click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(panel(page).getByText('Drop this note')).toHaveCount(0)
    await expect(pins(page), 'the pin outlived the comment it belonged to').toHaveCount(0)
    await expect(page.getByText('Comment deleted')).toBeVisible()
    // The pair that opened #424: a success toast beside "Internal Server Error".
    await expect(page.getByText('Internal Server Error')).toHaveCount(0)
  })

  test('closing the panel leaves nothing behind', async ({ page, diagram }) => {
    await diagram.open('unified', { empty: true })
    await addComment(page, 'Check the spacing')

    await panel(page).getByRole('button', { name: 'Close comments' }).click()

    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByPlaceholder('Add a comment…'), 'a half-written draft survived the close').toHaveCount(0)
  })
})
