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

  // Strikethrough moved behind "More formatting" (#419), and frappe-ui portals a
  // Popover's body out of its trigger's subtree — so it is NOT inside the bar and
  // has to be reached through the portalled panel.
  async function strikethrough(page) {
    await bar(page).getByRole('button', { name: 'More formatting' }).click()
    return page.locator('[data-slot="content"]').getByRole('button', { name: 'Strikethrough' })
  }

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
    // measures the entry that is on the bar now rather than the moved control.
    const entry = bar(page).getByRole('button', { name: 'More formatting' })
    await expect(entry).toBeVisible()
    const box = await entry.boundingBox()
    expect(box?.width, 'the toolbar rendered with no width').toBeGreaterThan(0)
    expect(box?.height, 'the toolbar rendered with no height').toBeGreaterThan(0)
  })

  test('strikethrough, duplicate and delete all work from it', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    const stickies = async () => (await diagram.saved(name)).whiteboard.stickyNotes

    await selectSticky(page)
    await (await strikethrough(page)).click()
    await expect
      .poll(async () => (await stickies())[0].strike, { message: 'strikethrough did not persist', timeout: 20_000 })
      .toBe(true)

    await bar(page).getByRole('button', { name: 'Duplicate' }).click()
    await expect
      .poll(async () => (await stickies()).length, { message: 'duplicate did not persist', timeout: 20_000 })
      .toBe(2)

    // Duplicating selects the copy, so Delete removes that one and leaves the original.
    await bar(page).getByRole('button', { name: 'Delete' }).click()
    await expect
      .poll(async () => (await stickies()).length, { message: 'delete did not persist', timeout: 20_000 })
      .toBe(1)
  })

  test('recolouring from the swatches persists', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    const before = (await diagram.saved(name)).whiteboard.stickyNotes[0].color

    await selectSticky(page)
    const swatches = bar(page).locator('button[aria-label^="Colour"]')
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
