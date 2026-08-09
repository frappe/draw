import { test, expect } from '../helpers/fixtures.js'

// The sticky note's floating control (#356). It was written as a <Teleport>
// inside WhiteboardStickyNote, whose root is an SVG <g> — so Vue built it in the
// SVG namespace and it landed in <body> with no layout box: in the DOM, styled,
// and 0x0. None of it could be seen or clicked. It now renders from EditorShell.
//
// The assertions are on the rendered BOX, not on presence: the whole failure
// mode was an element that exists and measures zero.
test.describe('sticky note toolbar (#356)', () => {
  // Scoped: the block text editor carries its own Strikethrough, so an unscoped
  // role lookup matches two buttons once both are on screen.
  const bar = (page) => page.locator('[data-sticky-toolbar]')

  async function selectSticky(page) {
    const sticky = page.getByText('note', { exact: true }).first()
    const box = await sticky.boundingBox()
    if (!box) throw new Error('the seeded sticky note is not rendered')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }

  test('the control is actually laid out, not a zero-sized ghost', async ({ page, diagram }) => {
    await diagram.open('whiteboard', {})
    await selectSticky(page)

    const strike = bar(page).getByRole('button', { name: 'Strikethrough' })
    await expect(strike).toBeVisible()
    const box = await strike.boundingBox()
    expect(box?.width, 'the toolbar rendered with no width').toBeGreaterThan(0)
    expect(box?.height, 'the toolbar rendered with no height').toBeGreaterThan(0)
  })

  test('strikethrough, duplicate and delete all work from it', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    const stickies = async () => (await diagram.saved(name)).whiteboard.stickyNotes

    await selectSticky(page)
    await bar(page).getByRole('button', { name: 'Strikethrough' }).click()
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
