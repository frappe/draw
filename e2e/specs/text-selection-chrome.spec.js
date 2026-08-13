import { test, expect } from '../helpers/fixtures.js'
import { TEXT_EDITOR, exitTextEdit } from '../helpers/editor.js'

// Canvas text chrome (#414). Typing one line on the canvas used to come wrapped in
// the same bright blue dashed box a drawn rectangle gets, plus a blue ring inside
// it while the caret was there — so "type here" read as "fill in this large text
// box". Text answers hover and selection in neutral grey now, and shows nothing at
// all while it is being typed into.
//
// The assertions read the rendered stroke, because the fault is entirely visual:
// every one of these states already worked, and every one of them was blue.

const NEUTRAL_SELECT = '#525252'
const NEUTRAL_HOVER = '#C7C7C7'
const SELECT_BLUE = '#006EDB'

const outlines = (page) => page.locator('[data-selection-layer] rect')
const hoverHalo = (page) => page.locator('[data-hover-outline] rect')

// Drop a text element at a point on empty canvas and type into it.
async function typeOnCanvas(page, { x, y }, words) {
  await page.mouse.dblclick(x, y)
  await expect(page.locator(TEXT_EDITOR), 'double-click left no caret to type into').toBeVisible()
  await page.keyboard.type(words)
}

test.describe('canvas text selection chrome (#414)', () => {
  test('shows no box at all while the text is being typed', async ({ page, diagram }) => {
    await diagram.open('unified', { empty: true })

    await typeOnCanvas(page, { x: 400, y: 400 }, 'Hello World')

    // The element is selected while it is edited, so this is the state that used to
    // draw the dashed box, eight handles and a rotation knob around a typed line.
    await expect(outlines(page), 'the editor is drawing chrome around the caret').toHaveCount(0)
  })

  test('selects to a tight neutral outline, not the blue dashes', async ({ page, diagram }) => {
    await diagram.open('unified', { empty: true })

    await typeOnCanvas(page, { x: 400, y: 400 }, 'Hello World')
    await exitTextEdit(page)
    await page.mouse.click(402, 402)

    const outline = outlines(page).first()
    await expect(outline).toHaveAttribute('stroke', NEUTRAL_SELECT)
    await expect(outline, 'a selected text element must not be dashed').not.toHaveAttribute(
      'stroke-dasharray',
      /.+/,
    )
  })

  test('keeps the blue dashes on a drawn shape', async ({ page, diagram }) => {
    // The neutral treatment is for text only — this is the control.
    await diagram.open('unified', {})

    const shape = page.locator('[data-shape-id="s1"]')
    const box = await shape.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    const outline = outlines(page).first()
    await expect(outline).toHaveAttribute('stroke', SELECT_BLUE)
    await expect(outline).toHaveAttribute('stroke-dasharray', /.+/)
  })

  test('hovers to a subtle grey line', async ({ page, diagram }) => {
    await diagram.open('unified', { empty: true })

    await typeOnCanvas(page, { x: 400, y: 400 }, 'Hello World')
    await exitTextEdit(page)
    // Away from the text, so it is not selected — the halo only draws on an
    // unselected shape — then back over it.
    await page.mouse.click(800, 200)
    await page.mouse.move(404, 404)

    await expect(hoverHalo(page).first()).toHaveAttribute('stroke', NEUTRAL_HOVER)
  })
})
