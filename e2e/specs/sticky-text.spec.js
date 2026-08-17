import { test, expect } from '../helpers/fixtures.js'
import { boxInWindow } from '../helpers/editor.js'

// Sticky note text and selection (#416).
//
// Two faults, both invisible to a unit test:
//
//   1. Enter inside the note's contentEditable made the browser wrap each line in
//      its own <div>, and the commit read the field with textContent — which
//      concatenates those with nothing between them. Three typed lines reached the
//      saved document as one. So this asserts the PERSISTED text, not the DOM.
//   2. A selected sticky kept the canvas toolbar after the user clicked a shape,
//      and the colour they picked landed on the sticky. Shapes and whiteboard
//      objects hold separate selections and the toolbar reads the whiteboard one
//      first, so nothing but a real click sequence shows it.

const notes = async (diagram, name) => (await diagram.saved(name)).whiteboard.stickyNotes

async function editSticky(page) {
  const note = page.getByText('note', { exact: true }).first()
  const box = await boxInWindow(page, note, 'the seeded sticky note')
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.dblclick(point.x, point.y)
  await expect(page.locator('foreignObject div[contenteditable="true"]')).toBeVisible()
  // The caret opens at the end of the existing text; take it all so the typing
  // below replaces the seeded word rather than appending to it.
  await page.keyboard.press('ControlOrMeta+a')
}

test.describe('sticky note text (#416)', () => {
  test('keeps the line breaks that were typed', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})

    await editSticky(page)
    await page.keyboard.type('First line')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Second line')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => (await notes(diagram, name))[0].text, {
        message: 'the line break never reached the saved note',
        timeout: 20_000,
      })
      .toBe('First line\nSecond line')
  })

  test('carries a hyphen list onto the next line', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})

    await editSticky(page)
    await page.keyboard.type('- Ship the editor')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Write the release notes')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => (await notes(diagram, name))[0].text, {
        message: 'Enter did not continue the list',
        timeout: 20_000,
      })
      .toBe('- Ship the editor\n- Write the release notes')
  })

  test('grows so the typed text stays inside the note', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    const seeded = (await notes(diagram, name))[0].h

    await editSticky(page)
    for (const line of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']) {
      await page.keyboard.type(line)
      await page.keyboard.press('Enter')
    }
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => (await notes(diagram, name))[0].h, {
        message: 'the note never grew to hold its text',
        timeout: 20_000,
      })
      .toBeGreaterThan(seeded)
  })

  test('shows no creator name', async ({ page, diagram }) => {
    await diagram.open('whiteboard', {})

    // The note used to carry an author chip naming whoever made it. The suite runs
    // as Administrator, so that is the name it would print.
    await expect(page.locator('svg').getByText('Administrator')).toHaveCount(0)
  })
})

test.describe('sticky note selection (#416)', () => {
  test('hands the toolbar over when a shape is clicked next', async ({ page, diagram }) => {
    await diagram.open('unified', {})
    const bar = page.locator('[data-canvas-toolbar]')

    const note = page.getByText('note', { exact: true }).first()
    const noteBox = await boxInWindow(page, note, 'the seeded sticky note')
    await page.mouse.click(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2)
    // A sticky's paper-colour swatch: the one control on the bar that ONLY the
    // sticky group renders. Strikethrough moved onto the bar in #500, but the block
    // text group has a Strikethrough too, so that name no longer tells the two
    // groups apart — which is the whole thing this test is checking.
    const stickyOnly = bar.getByRole('button', { name: /^Colour #/ })
    await expect(stickyOnly.first()).toBeVisible()

    // s1, the seeded rectangle at (120,140) — far from the sticky at (700,200).
    const shape = page.locator('[data-shape-id="s1"]')
    const shapeBox = await boxInWindow(page, shape, 'the seeded rectangle')
    await page.mouse.click(shapeBox.x + shapeBox.width / 2, shapeBox.y + shapeBox.height / 2)

    // The sticky's own group must be gone from the bar: while it was there, a
    // colour picked for the rectangle recoloured the sticky instead.
    await expect(stickyOnly).toHaveCount(0)
  })
})

// #501: sticky text gets the options a text box has. It stored a plain string and a
// note-wide `strike` boolean, so bold, a size, an alignment, a text colour — and
// "half of this struck through" — could not be said at all.
test.describe('sticky note text options (#501)', () => {
  const bar = (page) => page.locator('[data-canvas-toolbar]')
  // Exact and scoped: the fixture names each diagram after its own test, so the
  // title button's accessible name carries the test's words and getByRole matches
  // substrings by default.
  const control = (page, name) => bar(page).getByRole('button', { name, exact: true })
  const notes = async (diagram, name) => (await diagram.saved(name)).whiteboard.stickyNotes

  async function selectSticky(page) {
    const sticky = page.getByText('note', { exact: true }).first()
    const box = await sticky.boundingBox()
    if (!box) throw new Error('the seeded sticky note is not rendered')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }

  test('bolding a selected note persists as a run, keeping the text intact', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    await selectSticky(page)

    await control(page, 'Bold').click()

    await expect
      .poll(async () => (await notes(diagram, name))[0]?.runs?.[0]?.bold, {
        message: 'bolding a note never reached the saved document',
        timeout: 20_000,
      })
      .toBe(true)
    // `text` stays the plain source of truth, exactly as a table cell's does.
    expect((await notes(diagram, name))[0].text).toBe('note')
  })

  test('the note carries its own text size, alignment and colour', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', {})
    const paper = (await notes(diagram, name))[0].color
    await selectSticky(page)

    await control(page, 'Align center').click()
    await expect
      .poll(async () => (await notes(diagram, name))[0]?.textStyle?.align, {
        message: 'the alignment never reached the document',
        timeout: 20_000,
      })
      .toBe('center')

    await control(page, 'Note text colour').click()
    await page.getByRole('button', { name: 'blue 500', exact: true }).click()
    await expect
      .poll(async () => (await notes(diagram, name))[0]?.textStyle?.color, {
        message: 'the text colour never reached the document',
        timeout: 20_000,
      })
      .toBe('#0289F7')

    // The PAPER colour is a different axis and must not have moved with the ink.
    expect((await notes(diagram, name))[0].color, 'the paper changed with the ink').toBe(paper)
  })
})
