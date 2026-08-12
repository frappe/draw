import { test, expect } from '../helpers/fixtures.js'
import {
  ffShape,
  ffNode,
  mindmapAddHandles,
  exitTextEdit,
  boxInWindow,
} from '../helpers/editor.js'

// #427: the mind map has to work as a brainstorming surface — reach for a "+" and
// it is still there, drag a node and it goes where you dropped it, type and the
// text stays inside the node. Every assertion reads the PERSISTED document, because
// a change that renders but never reaches shapes[] is this app's characteristic
// failure. The seeded map is Root with Branch A/B on the right and Branch C on the
// left, at an origin inside the window.
// A seeded unified document is flattened to free-floating shapes on open but only
// PERSISTED on the first edit, so `saved()` is empty until then — baselines that
// have to exist beforehand are read from the rendered canvas instead.
const nodes = (doc) => (doc.shapes || []).filter((s) => s.role === 'mindmap-node')
const node = (doc, id) => nodes(doc).find((s) => s.id === id)
const branchInto = (doc, id) =>
  (doc.connectors || []).find((c) => c.role === 'mindmap-branch' && c.to?.shapeId === id)

// Hover a node's centre, having come from somewhere else first: the "+" column is
// hover-driven, so a pointer that is already parked on the node never triggers it.
async function hoverNode(page, locator, what) {
  const box = await boxInWindow(page, locator, what)
  await page.mouse.move(box.x - 60, box.y - 60)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  return box
}

test.describe('mind map interaction (#427)', () => {
  // Item 1 + 7: the "+" used to vanish while the pointer travelled the gap between
  // the node and the control, and only a pixel-perfect hit on the small circle
  // counted. This walks that corridor step by step and then clicks OFF CENTRE.
  test('the "+" survives the trip from the node and takes an off-centre click', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })

    await hoverNode(page, ffNode(page, 'Branch A'), 'Branch A')
    const handle = mindmapAddHandles(page).first()
    await expect(handle).toBeVisible()
    const target = await handle.boundingBox()
    const from = await boxInWindow(page, ffNode(page, 'Branch A'), 'Branch A')

    // Walk the corridor in small steps, checking the column is still there at each
    // one — the old failure was mid-travel, not at either end.
    const startX = from.x + from.width
    const startY = from.y + from.height / 2
    for (let step = 1; step <= 6; step += 1) {
      const ratio = step / 6
      await page.mouse.move(
        startX + (target.x + target.width / 2 - startX) * ratio,
        startY + (target.y + target.height / 2 - startY) * ratio,
      )
      await expect(handle, `the "+" disappeared ${step}/6 of the way toward it`).toBeVisible()
    }

    // Off the mark but inside the target: a 7px miss used to add nothing at all.
    await page.mouse.click(target.x + target.width / 2 + 7, target.y + target.height / 2)

    await expect
      .poll(async () => nodes(await diagram.saved(name)).length, {
        message: 'clicking near — not exactly on — the "+" added no node',
        timeout: 20_000,
      })
      .toBe(5) // Root + Branch A/B/C, plus the one just added
  })

  // Item 4: a child could not be dragged at all. Dropping one INSIDE another node
  // makes it that node's child, and its branch follows.
  test('dragging a node onto another re-parents it, and the branch follows', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })
    const source = await boxInWindow(page, ffShape(page, 'm3'), 'Branch B')
    const target = await boxInWindow(page, ffShape(page, 'm2'), 'Branch A')

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 })
    await page.mouse.up()

    await expect
      .poll(async () => node(await diagram.saved(name), 'm3')?.mindmap.parentId, {
        message: 'dropping Branch B onto Branch A did not re-parent it',
        timeout: 20_000,
      })
      .toBe('m2')
    const doc = await diagram.saved(name)
    const branch = branchInto(doc, 'm3')
    expect(branch.from.shapeId, 'the branch now leaves its new parent').toBe('m2')
    // The id still encodes the ORIGINAL parent (mmb-<parent>-<child>): the connector
    // was re-pointed, not replaced, so undo and collaborators read a move.
    expect(branch.id, 'the branch was replaced instead of re-pointed').toBe('mmb-m1-m3')
  })

  // Items 4 + 8: re-ordering among siblings must move the dragged node and NOTHING
  // else. Branch C is on the other side of the root and may not budge.
  test('dragging a node among its siblings re-orders it and leaves other branches alone', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })
    const untouched = await ffShape(page, 'm4').boundingBox()
    const source = await boxInWindow(page, ffShape(page, 'm3'), 'Branch B')
    const above = await boxInWindow(page, ffShape(page, 'm2'), 'Branch A')

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
    await page.mouse.down()
    // Just above Branch A: the slot before the first child.
    await page.mouse.move(above.x + above.width / 2, above.y - 24, { steps: 15 })
    await page.mouse.up()

    await expect
      .poll(async () => {
        const doc = await diagram.saved(name)
        return node(doc, 'm3').mindmap.order < node(doc, 'm2').mindmap.order
      }, {
        message: 'Branch B did not move above Branch A',
        timeout: 20_000,
      })
      .toBe(true)
    const after = await ffShape(page, 'm4').boundingBox()
    expect(
      { x: Math.round(after.x), y: Math.round(after.y) },
      'the branch on the other side of the root moved when it had no reason to',
    ).toEqual({ x: Math.round(untouched.x), y: Math.round(untouched.y) })
  })

  // Item 5: a long label used to run straight out of the node — the label was a
  // single unwrapped line of SVG text, and the box never grew to fit it either.
  test('a long label grows the node and stays inside it', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })
    const before = await ffShape(page, 'm2').boundingBox()
    const box = await boxInWindow(page, ffShape(page, 'm2'), 'Branch A')

    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.type('a deliberately long label that has to wrap more than once')
    await exitTextEdit(page)

    await expect
      .poll(async () => (await ffShape(page, 'm2').boundingBox()).height > before.height, {
        message: 'the node did not grow to fit its wrapped label',
        timeout: 20_000,
      })
      .toBe(true)

    const nodeBox = await ffShape(page, 'm2').boundingBox()
    const labelBox = await page.getByText('a deliberately long label', { exact: false }).first().boundingBox()
    expect(labelBox.width, 'the label is wider than the node it sits in').toBeLessThanOrEqual(nodeBox.width)
    expect(labelBox.height, 'the label is taller than the node it sits in').toBeLessThanOrEqual(nodeBox.height)
  })
})
