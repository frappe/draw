import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { POPOVER, buttonByIcon, dragShapeFromCatalog } from '../helpers/editor.js'

// #27: a shape added to a canvas that already held freehand ink rendered UNDER
// the ink, and Arrange could not lift it out — the two lived on separate stacking
// scales and the whiteboard layer painted shapes first, unconditionally.
//
// The store test covers the ordering arithmetic. What only the real editor can
// prove is the thing the user reported: the paint order in the DOM, driven from
// the palette and the Arrange menu.

const INK = 'path[stroke="#171717"]' // the seeded whiteboard stroke
const SEEDED_SHAPES = ['s1', 's2']

// Which of the two paints on top, read off the live SVG: later in document order
// is later in paint order.
function shapePaintsOverInk(page, shapeId) {
  return page.evaluate(
    ([id, ink]) => {
      const stroke = document.querySelector(ink)
      const shape = document.querySelector(`[data-shape-id="${id}"]`)
      if (!stroke || !shape) return null
      return Boolean(stroke.compareDocumentPosition(shape) & Node.DOCUMENT_POSITION_FOLLOWING)
    },
    [shapeId, INK],
  )
}

// The id of the shape the drop created (the fixture seeds s1 and s2).
async function droppedShapeId(diagram, name) {
  let id = null
  await expect
    .poll(
      async () => {
        const doc = await diagram.saved(name)
        id = (doc.shapes || []).map((s) => s.id).find((s) => !SEEDED_SHAPES.includes(s))
        return Boolean(id)
      },
      { message: 'dropping a palette tile did not save a new shape', timeout: 20_000 },
    )
    .toBe(true)
  return id
}

// Both sides of every comparison, read off the persisted document. They fail
// loudly rather than as a TypeError, because the seeded content they depend on
// lives in a fixture this spec does not own.
function zOf(doc, id) {
  const shape = (doc.shapes || []).find((s) => s.id === id)
  if (!shape) throw new Error(`shape ${id} is not in the saved document`)
  return shape.zIndex
}

function inkZ(doc) {
  const stroke = (doc.whiteboard?.strokes || [])[0]
  if (!stroke) throw new Error('the seeded board has no stroke — this spec needs ink to stack against')
  return stroke.zIndex
}

// Click one of the Arrange actions for the current selection. The menu is a
// Popover that stays open after an action is clicked (several arranges in a row
// is the point of it), and its trigger TOGGLES — so opening unconditionally
// would shut an already-open menu and then wait forever for it to appear.
async function arrange(page, action) {
  const menu = page.locator(POPOVER)
  if (!(await menu.isVisible())) {
    await buttonByIcon(page, 'layers').click()
    await menu.waitFor({ state: 'visible' })
  }
  await menu.getByText(action, { exact: true }).click()
}

test.describe('stacking order across shapes and ink', () => {
  test('a shape dropped onto existing ink paints over it', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    const name = await diagram.open('unified')

    await dragShapeFromCatalog(page, { x: 320, y: 300 })
    const id = await droppedShapeId(diagram, name)

    const doc = await diagram.saved(name)
    expect(zOf(doc, id), 'a newly dropped shape must stack above the ink already there')
      .toBeGreaterThan(inkZ(doc))
    expect(await shapePaintsOverInk(page, id)).toBe(true)

    expect(errors.pageErrors).toEqual([])
  })

  test('Arrange moves a shape below the ink and back over it', async ({ page, diagram }) => {
    const name = await diagram.open('unified')

    await dragShapeFromCatalog(page, { x: 320, y: 300 })
    const id = await droppedShapeId(diagram, name)

    const shape = page.locator(`[data-shape-id="${id}"]`).first()
    const box = await shape.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    await arrange(page, 'To back')
    await expect
      .poll(async () => {
        const doc = await diagram.saved(name)
        return zOf(doc, id) < inkZ(doc)
      }, { message: 'To back did not move the shape under the ink', timeout: 20_000 })
      .toBe(true)
    expect(await shapePaintsOverInk(page, id)).toBe(false)

    await arrange(page, 'To front')
    await expect
      .poll(async () => {
        const doc = await diagram.saved(name)
        return zOf(doc, id) > inkZ(doc)
      }, { message: 'To front did not bring the shape back over the ink', timeout: 20_000 })
      .toBe(true)
    expect(await shapePaintsOverInk(page, id)).toBe(true)
  })
})
