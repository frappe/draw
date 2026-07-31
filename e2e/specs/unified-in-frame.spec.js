import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { SURFACE, clickNode, MM_TOOLBAR, enterFrame, backToCanvas } from '../helpers/editor.js'

// THE untested seam of the unified canvas.
//
// unified-canvas.spec.js proves a double-click ENTERS in-frame editing (a
// breadcrumb appears). legacy-types.spec.js proves each type's operations work on
// its own single-type document. Nothing checks the intersection: that once you are
// inside a frame on the unified canvas, the type's operations still work — which is
// precisely where "merging the four types onto one canvas broke previously-working
// functionality" would hide.
//
// So these mirror the legacy mind-map and flowchart tests, operation for operation,
// against a UNIFIED document. A failure here means the feature works standalone and
// is broken on the canvas every new diagram now uses.
//
// Assertions go through the PERSISTED document, as everywhere else in this suite:
// on the unified canvas frames render read-only until focus mode is entered, so a
// test that only looked at pixels could pass while nothing saved.

// The flowchart frame has no .fd-mm-label, so entering it keys off the node text.
async function enterFlowchartNode(page, label) {
  const target = page.getByText(label, { exact: true }).first()
  const box = await target.boundingBox()
  if (!box) throw new Error(`flowchart node "${label}" is not rendered`)
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect(backToCanvas(page)).toBeVisible({ timeout: 10_000 })
}

test.describe('unified canvas: mind-map operations inside a frame', () => {
  test('Tab adds a child node, as it does on a standalone mind map', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })
    await enterFrame(page, 'Branch A')

    await clickNode(page, 'Branch A')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, {
        message: 'Tab inside a unified frame did not add a child node',
        timeout: 20_000,
      })
      .toBe(5)
  })

  test('arrow-key navigation moves the selection to the next node', async ({ page, diagram }) => {
    // Deliberately NOT "the toolbar is still visible" — that assertion passes when
    // the arrow key does nothing at all, which is exactly the bug this file found.
    // Navigate, then add a child: the new node's parent proves where the selection
    // actually landed, and it is checked against the persisted document.
    const name = await diagram.open('unified', { framesInView: true })
    await enterFrame(page, 'Branch A')

    await clickNode(page, 'Branch A')
    await expect(page.locator(MM_TOOLBAR)).toBeVisible()
    await page.keyboard.press('ArrowDown') // Branch A (order 0) -> Branch B (order 1)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => {
        const nodes = (await diagram.saved(name)).mindmap.nodes
        const added = nodes.find((n) => !['m1', 'm2', 'm3', 'm4'].includes(n.id))
        return added?.parentId
      }, {
        message: 'arrow nav did not move the selection from Branch A to Branch B',
        timeout: 20_000,
      })
      .toBe('m3')
  })

  test('deleting a leaf node persists', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })
    await enterFrame(page, 'Branch C')

    await clickNode(page, 'Branch C') // a leaf
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, {
        message: 'deleting a node inside a unified frame did not persist',
        timeout: 20_000,
      })
      .toBe(3)
  })
})

test.describe('unified canvas: flowchart operations inside a frame', () => {
  // Regression guard for a register/unregister race in the interaction registry.
  // Entering a flowchart frame swaps the frame's read-only FlowchartLayer for the
  // focus-mode one, and Vue mounts the incoming component before unmounting the
  // outgoing one. Both use the layer key 'flowchart', so the outgoing unmount hook
  // deleted the entry the incoming instance had just registered — the registry ended
  // up empty, delegatesSurface() went false, and every surface event fell through to
  // the block handling. The node did not move at all, not even on screen, so it read
  // as "frames are render-only" rather than a dead seam.
  test('a node can be moved and the move persists', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { framesInView: true })
    await enterFlowchartNode(page, 'Do work')
    const before = (await diagram.saved(name)).flowchart.nodes.find((n) => n.id === 'f2')

    // Entering focus mode re-frames the view (the editor becomes the flowchart's own
    // single-type editor and re-opens at 100%), so a bounding box read before that
    // settles points at where the node USED to be and the drag starts on empty
    // canvas. Wait for the reframe, then take the box immediately before dragging.
    await expect(page.locator(SURFACE).first()).toBeVisible()
    const label = page.getByText('Do work', { exact: true }).first()
    await expect(label).toBeVisible()
    const box = await (async () => {
      let last = null
      await expect
        .poll(async () => {
          const next = await label.boundingBox()
          const settled = last && next && next.x === last.x && next.y === last.y
          last = next
          return Boolean(settled)
        }, { message: 'the view never stopped moving after entering the frame', timeout: 10_000 })
        .toBe(true)
      return last
    })()

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 60, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(async () => {
        const n = (await diagram.saved(name)).flowchart.nodes.find((x) => x.id === 'f2')
        return n.x !== before.x || n.y !== before.y
      }, {
        message: 'dragging a flowchart node inside a unified frame did not persist',
        timeout: 20_000,
      })
      .toBe(true)
  })

  test('the seeded edges render inside the frame', async ({ page, diagram }) => {
    await diagram.open('unified', { framesInView: true })
    for (const label of ['Start', 'Do work', 'OK?']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    const routes = await page.locator(`${SURFACE} path[stroke]:not([stroke="none"])`).count()
    expect(routes, 'flowchart edges did not render on the unified canvas').toBeGreaterThanOrEqual(2)
  })
})

test.describe('unified canvas: leaving a frame', () => {
  test('an in-frame editing session raises no uncaught errors', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    await diagram.open('unified', { framesInView: true })

    await enterFrame(page, 'Branch A')
    await clickNode(page, 'Branch A')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    // "Back to canvas" clears focusedFrame; the block/whiteboard tools must return.
    await backToCanvas(page).click()

    await expect(page.locator(SURFACE).first()).toBeVisible()
    expect(errors.pageErrors, 'in-frame editing raised uncaught exceptions').toEqual([])
    expect(errors.failures, 'in-frame editing made requests that failed').toEqual([])
  })
})
