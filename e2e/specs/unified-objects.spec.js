import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import {
  SURFACE,
  ffNode,
  selectShape,
  flowchartNode,
  boxInWindow,
  dragNode,
  mindmapAddHandles,
} from '../helpers/editor.js'

// THE untested seam of the unified canvas.
//
// legacy-types.spec.js proves each type's operations work on its own single-type
// document. Nothing else checks the intersection: that a mind map or flowchart living
// on the unified canvas still supports those operations — which is precisely where
// "merging the four types onto one canvas broke previously-working functionality" hides.
//
// After the free-floating refactor (#122) a mind-map / flowchart node on the unified
// canvas is an ordinary role-tagged SHAPE in shapes[]: it selects, drags, deletes and
// grows through the shared shape machinery, and the retired mindmap/flowchart
// sub-models stay empty. So these assert on the PERSISTED shapes[] BY ROLE — never
// .mindmap.nodes / .flowchart.nodes or a frame hit-rect — because rendering something
// that never saves is this app's characteristic failure.
//
// The migration keeps each node's id across the flatten (Root=m1, Branch A=m2, Branch
// B=m3, Branch C=m4; Start=f1, Do work=f2, OK?=f3), so a node is addressed by its id or
// its label text. It is persisted on the first EDIT, not on open, so counts are read
// after the edit that flattens the doc.

const mindmapNodes = (doc) => (doc.shapes || []).filter((s) => s.role === 'mindmap-node')

test.describe('unified canvas: mind-map operations on free-floating nodes', () => {
  test('Tab adds a child under the selected node, and its "+" handle shows', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })

    await selectShape(page, ffNode(page, 'Branch A'), 'mind-map node "Branch A"')
    // The mouse affordance appears for the sole-selected node (#118)…
    await expect(mindmapAddHandles(page).first()).toBeVisible()
    // …and the keyboard grows a child.
    await page.keyboard.press('Tab')

    await expect
      .poll(async () => mindmapNodes(await diagram.saved(name)).length, {
        message: 'Tab on a unified-canvas mind-map node did not add a child shape',
        timeout: 20_000,
      })
      .toBe(5)
    // The child hangs off Branch A (m2), not some other node.
    const added = mindmapNodes(await diagram.saved(name)).find(
      (s) => !['m1', 'm2', 'm3', 'm4'].includes(s.id),
    )
    expect(added.mindmap.parentId, 'the new child is not parented to Branch A').toBe('m2')
  })

  test('the "+" add-handle adds a child with the mouse', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })

    await selectShape(page, ffNode(page, 'Branch B'), 'mind-map node "Branch B"')
    const handle = mindmapAddHandles(page).first()
    await expect(handle).toBeVisible()
    // Press the "+" itself with a real mouse click at its centre — the block marquee is
    // suppressed on the handle (@pointerdown.stop), so this adds rather than rubber-bands.
    const box = await handle.boundingBox()
    if (!box) throw new Error('the mind-map "+" add-handle is not rendered')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    await expect
      .poll(async () => mindmapNodes(await diagram.saved(name)).length, {
        message: 'clicking the mind-map "+" handle did not add a node',
        timeout: 20_000,
      })
      .toBe(5)
  })

  test('deleting a leaf node persists', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })

    await selectShape(page, ffNode(page, 'Branch C'), 'mind-map node "Branch C"') // m4, a leaf
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => mindmapNodes(await diagram.saved(name)).length, {
        message: 'deleting a node on a unified-canvas mind map did not persist',
        timeout: 20_000,
      })
      .toBe(3)
  })

  // #45 removed focus mode: selecting a node edits it in place and the camera never
  // re-frames. Asserted on a NEIGHBOURING node, so the selected node's own outline can't
  // mask a real jump.
  test('selecting a node does not move the camera', async ({ page, diagram }) => {
    await diagram.open('unified', { framesInView: true })
    const neighbour = ffNode(page, 'Branch B')
    const before = await boxInWindow(page, neighbour, 'mind-map node "Branch B"')

    await selectShape(page, ffNode(page, 'Branch A'), 'mind-map node "Branch A"')

    const after = await boxInWindow(page, neighbour, 'mind-map node "Branch B"')
    expect(
      { x: Math.round(after.x), y: Math.round(after.y) },
      'selecting a node re-framed the canvas — the focus-mode camera jump is back',
    ).toEqual({ x: Math.round(before.x), y: Math.round(before.y) })
  })
})

test.describe('unified canvas: flowchart operations on free-floating nodes', () => {
  const flowchartNodes = (doc) => (doc.shapes || []).filter((s) => s.role === 'flowchart-node')

  test('a node drags on the canvas, and the new position persists to its shape', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })

    // The v1→v2 migration persists on the first EDIT, not on open — so drag once to land
    // f2 in shapes[] with a saved position, then drag again and prove it moved.
    await dragNode(page, flowchartNode(page, 'Do work'), 'flowchart node "Do work"', 120, 40)
    let before = null
    await expect
      .poll(async () => {
        before = flowchartNodes(await diagram.saved(name)).find((s) => s.id === 'f2')
        return Boolean(before)
      }, {
        message: 'dragging a flowchart node did not persist it as a shape',
        timeout: 20_000,
      })
      .toBe(true)

    await dragNode(page, flowchartNode(page, 'Do work'), 'flowchart node "Do work"', 150, 70)

    await expect
      .poll(async () => {
        const after = flowchartNodes(await diagram.saved(name)).find((s) => s.id === 'f2')
        return after.x !== before.x || after.y !== before.y
      }, {
        message: 'dragging a flowchart node on the unified canvas did not persist a new position',
        timeout: 20_000,
      })
      .toBe(true)
  })

  test('the seeded nodes and edges render', async ({ page, diagram }) => {
    await diagram.open('unified', { framesInView: true })
    // Nodes render via ShapeView (their labels); edges are connectors rendered by
    // ConnectorView as stroked paths. A bare `path` locator is not usable — it can
    // resolve to a zero-size marker def that is never "visible" — so match the routes by
    // the stroke they carry.
    for (const label of ['Start', 'Do work', 'OK?']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    const routes = await page.locator(`${SURFACE} path[stroke]:not([stroke="none"])`).count()
    expect(routes, 'flowchart edges did not render on the unified canvas').toBeGreaterThanOrEqual(2)
  })
})

test.describe('unified canvas: objects alongside the rest of the canvas', () => {
  test('an editing session on the free-floating objects raises no uncaught errors', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    await diagram.open('unified', { framesInView: true })

    await selectShape(page, ffNode(page, 'Branch A'), 'mind-map node "Branch A"')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    await dragNode(page, flowchartNode(page, 'Do work'), 'flowchart node "Do work"', 40, 30)

    await expect(page.locator(SURFACE).first()).toBeVisible()
    expect(errors.pageErrors, 'editing raised uncaught exceptions').toEqual([])
    expect(errors.failures, 'editing made requests that failed').toEqual([])
  })
})
