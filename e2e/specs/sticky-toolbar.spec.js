import { test, expect } from '../helpers/fixtures.js'

// The sticky note's controls (#356), now a group on the static canvas toolbar
// (#363) rather than a floating bar.
//
// The original fault: written as a <Teleport> inside WhiteboardStickyNote, whose
// root is an SVG <g>, Vue built it in the SVG namespace and it landed in <body>
// with no layout box — in the DOM, styled, and 0x0. None of it could be seen or
// clicked.
//
// The assertions stay on the rendered BOX rather than on presence, because that
// is the failure mode: an element that exists and measures zero. The toolbar
// makes it structurally unreachable (nothing there is built inside SVG), which
// is worth holding a test against rather than assuming.
test.describe('sticky note toolbar (#356)', () => {
  // Scoped to the toolbar. Strikethrough also appears in the block text group,
  // so an unscoped role lookup would be ambiguous the moment a shape and a
  // sticky are both reachable.
  const bar = (page) => page.locator('[data-canvas-toolbar]')

  // The one control ONLY the sticky group renders: its paper-colour swatches.
  // Strikethrough is on the bar since #500, but the block text group has a
  // Strikethrough too, so that name no longer identifies this group.
  const stickyOnly = (page) => bar(page).locator('button[aria-label^="Colour #"]')

  async function selectSticky(page) {
    const sticky = page.getByText('note', { exact: true }).first()
    const box = await sticky.boundingBox()
    if (!box) throw new Error('the seeded sticky note is not rendered')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }

  test('the control is actually laid out, not a zero-sized ghost', async ({ page, diagram }) => {
    await diagram.open('whiteboard', {})
    await selectSticky(page)

    // The zero-size fault this guards is about the GROUP being laid out, so it
    // measures a control the group itself renders. The "More" entry it used to
    // measure is gone: #500 put strikethrough on the bar and dropped the menu.
    const entry = stickyOnly(page).first()
    await expect(entry).toBeVisible()
    const box = await entry.boundingBox()
    expect(box?.width, 'the toolbar rendered with no width').toBeGreaterThan(0)
    expect(box?.height, 'the toolbar rendered with no height').toBeGreaterThan(0)
  })

  // Duplicate is gone with the menu (#500) — copy and paste covers it — so this
  // covers what is left: strikethrough straight from the bar, then delete.
  test('strikethrough and delete both work from the bar', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    const stickies = async () => (await diagram.saved(name)).whiteboard.stickyNotes

    await selectSticky(page)
    await bar(page).getByRole('button', { name: 'Strikethrough', exact: true }).click()
    // A mark, not the note-wide `strike` boolean this used to assert. #501 retired
    // that flag: sticky text carries runs now, so striking a selected note marks
    // the whole of it. The flag is still READ, so an old note keeps its strike —
    // it is simply never written again.
    await expect
      .poll(async () => (await stickies())[0]?.runs?.[0]?.strike, {
        message: 'strikethrough did not persist',
        timeout: 20_000,
      })
      .toBe(true)

    await bar(page).getByRole('button', { name: 'Delete' }).click()
    await expect
      .poll(async () => (await stickies()).length, { message: 'delete did not persist', timeout: 20_000 })
      .toBe(0)
  })

  test('offers no Duplicate, and no menu that used to hold it (#500)', async ({ page, diagram }) => {
    await diagram.open('whiteboard', {})
    await selectSticky(page)
    await expect(stickyOnly(page).first()).toBeVisible()

    await expect(bar(page).getByRole('button', { name: 'Duplicate' })).toHaveCount(0)
    await expect(bar(page).getByRole('button', { name: 'More sticky note actions' })).toHaveCount(0)
  })

  test('recolouring from the swatches persists', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    const before = (await diagram.saved(name)).whiteboard.stickyNotes[0].color

    await selectSticky(page)
    const swatches = stickyOnly(page)
    await expect(swatches.first()).toBeVisible()
    const target = await swatches.nth(3).getAttribute('aria-label')
    await swatches.nth(3).click()

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.stickyNotes[0].color, {
        message: 'the colour change did not persist',
        timeout: 20_000,
      })
      .toBe(target.replace('Colour ', ''))
    expect(before, 'the fixture colour already matched the swatch — test proves nothing').not.toBe(
      target.replace('Colour ', ''),
    )
  })
})
