import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import {
  SURFACE,
  toolByIcon,
  dragShapeFromCatalog,
  armShapeFromCatalog,
  armPolygonFromCatalog,
  armCreateToolFromCatalog,
  insertTableFromCatalog,
  dragOnCanvas,
  clickCanvas,
  clickEmptyCanvas,
  insertMindmapNode,
  insertFlowchartNode,
  mindmapAddHandles,
  flowchartAddHandles,
  ffShape,
  marqueeOver,
  minimap,
  clickMinimap,
  canvasTransform,
} from '../helpers/editor.js'

// The unified canvas is where the four diagram types were merged onto one surface,
// and where functionality that used to work regressed. Each test here asserts on the
// PERSISTED document wherever it can, not just on rendered pixels — a tool that
// draws something transient but never saves it looks fine on screen and is broken.


test.describe('unified canvas: block tools', () => {
  test('dragging a palette tile creates a persisted shape', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    const { payload } = await dragShapeFromCatalog(page, { x: 500, y: 320 })
    expect(payload, 'tile dragstart wrote no tool payload').toBeTruthy()

    await expect(page.locator(`${SURFACE} rect`).first()).toBeVisible()
    await expect
      .poll(async () => (await diagram.saved(name)).shapes.length, {
        message: 'dropped shape never reached the saved document',
        timeout: 20_000,
      })
      .toBe(1)
  })

  test('press-drag with an armed shape tool creates a shape', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await armShapeFromCatalog(page) // arms draw mode for the first shape (the rectangle)
    await dragOnCanvas(page, { x: 300, y: 250 }, { x: 520, y: 400 })

    await expect
      .poll(async () => (await diagram.saved(name)).shapes.length, { timeout: 20_000 })
      .toBe(1)
  })

  test('a shape can be selected, moved and undone', async ({ page, diagram }) => {
    const name = await diagram.open('unified')
    const before = (await diagram.saved(name)).shapes.find((s) => s.id === 's1')

    // Seeded s1 sits at logical (120,140); the canvas starts panned by a margin, so
    // click its middle via the rendered element rather than guessing screen coords.
    const shape = page.locator(`${SURFACE} rect`).first()
    const box = await shape.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 10 })
    await page.mouse.up()

    await expect
      .poll(async () => {
        const s = (await diagram.saved(name)).shapes.find((x) => x.id === 's1')
        return s.x !== before.x || s.y !== before.y
      }, { message: 'dragging a shape did not move it in the saved document', timeout: 20_000 })
      .toBe(true)

    await page.keyboard.press('Meta+z')
    await expect
      .poll(async () => {
        const s = (await diagram.saved(name)).shapes.find((x) => x.id === 's1')
        return s.x === before.x && s.y === before.y
      }, { message: 'undo did not restore the shape position', timeout: 20_000 })
      .toBe(true)
  })

  // The polygon (#139) is the one shape the catalog can't drag: its tile arms a
  // multi-click draw tool. Each click drops a vertex and Enter closes the path into a
  // real block shape on shapes[], so it is asserted on the persisted document like any
  // other shape rather than on the transient in-progress preview.
  test('the polygon tool places a multi-click shape', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await armPolygonFromCatalog(page)
    await clickCanvas(page, 300, 250)
    await clickCanvas(page, 480, 250)
    await clickCanvas(page, 400, 400)
    await page.keyboard.press('Enter') // closes the path with three vertices placed

    await expect
      .poll(async () => (await diagram.saved(name)).shapes.length, {
        message: 'closing the polygon did not persist a shape',
        timeout: 20_000,
      })
      .toBe(1)
    const doc = await diagram.saved(name)
    expect(doc.shapes[0].type, 'the placed shape is a polygon').toBe('polygon')
  })
})

test.describe('unified canvas: whiteboard tools', () => {
  test('the pen draws a stroke that persists', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    // On the unified bar the pen is no longer a bar button — it moved into the "+"
    // catalog (#90), so it is armed there by its 'pen-line' tile, not off the toolbar.
    await armCreateToolFromCatalog(page, 'pen-line')
    await dragOnCanvas(page, { x: 300, y: 260 }, { x: 640, y: 420 }, 14)

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.strokes.length, {
        message: 'pen stroke never reached the saved document',
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
  })

  // The whiteboard's tool letters had no effect on a unified document: the shared
  // dispatcher resolves the owning keyboard from the document type, and a unified
  // document resolves to block. Asserted through a real stroke rather than on the
  // toolbar's armed state, so it proves the letter selected a tool that then WORKS.
  test('a tool letter picks a whiteboard tool', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await clickEmptyCanvas(page) // focus the canvas, select nothing
    await page.keyboard.press('p')
    await dragOnCanvas(page, { x: 300, y: 260 }, { x: 640, y: 420 }, 14)

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.strokes.length, {
        message: 'pressing P did not arm the pen on a unified document',
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
  })

  // Tab chains sticky notes, but ONLY when a sticky is selected — a mind-map node
  // selection keeps Tab for adding a child (covered in unified-objects.spec.js). The
  // two used to be unable to coexist on one surface; the dispatcher resolves it by
  // offering Tab to the whiteboard last.
  test('Tab drops the next sticky beside the selected one', async ({ page, diagram }) => {
    const name = await diagram.open('unified', {})
    const sticky = page.getByText('note', { exact: true }).first()
    const box = await sticky.boundingBox()
    if (!box) throw new Error('the seeded sticky note is not rendered')

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.press('Tab')

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.stickyNotes.length, {
        message: 'Tab did not chain a second sticky note on a unified document',
        timeout: 20_000,
      })
      .toBe(2)
  })

  test('a sticky note can be placed', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await armCreateToolFromCatalog(page, 'sticky-note')
    await clickCanvas(page, 460, 300)

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.stickyNotes.length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
  })

  // Placing a whiteboard object without being able to remove it is worse than not
  // being able to place it. Delete was the only route those objects ever had — the
  // eraser rubs out ink only — and it ran through the whiteboard's own key handler,
  // which is not the owning mode on a unified document. So a sticky placed on a new
  // drawing stayed there permanently. The legacy-whiteboard equivalent of this test
  // passed the whole time, which is why nothing caught it.
  test('a sticky note can be deleted again', async ({ page, diagram }) => {
    const name = await diagram.open('unified', {})
    const sticky = page.getByText('note', { exact: true }).first()
    const box = await sticky.boundingBox()
    if (!box) throw new Error('the seeded sticky note is not rendered')

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.stickyNotes.length, {
        message: 'a sticky note on the unified canvas could not be deleted',
        timeout: 20_000,
      })
      .toBe(0)
  })

  // The Table tool no longer drops a fixed 3×3 grid on click (#134): its catalog tile
  // opens a size picker, and the size is committed by clicking a cell. A committed
  // table lands on whiteboard.tables[], so that is what proves the picker wired
  // through — not the rendered grid, which a table that never saved would still show.
  test('a table is placed at the size picked in the popover', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertTableFromCatalog(page, 3, 3)

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.tables.length, {
        message: 'picking a size did not persist a table',
        timeout: 20_000,
      })
      .toBe(1)
    const table = (await diagram.saved(name)).whiteboard.tables[0]
    expect({ rows: table.rows, cols: table.cols }, 'the table matches the picked size').toEqual({
      rows: 3,
      cols: 3,
    })
  })
})

test.describe('unified canvas: free-floating mind map & flowchart', () => {
  // The mind map and flowchart are no longer framed sub-models (#122): the "+" catalog
  // drops a single ROLE-TAGGED SHAPE onto shapes[], and the retired mindmap/flowchart
  // sub-models stay empty. Every assertion reads the PERSISTED shapes[] by role — never
  // .mindmap.nodes / .flowchart.nodes or a frame hit-rect — because a node that renders
  // but never reaches shapes[] is exactly this app's characteristic failure.
  const nodesOf = (doc, role) => (doc.shapes || []).filter((s) => s.role === role)

  test('inserting a mind map adds one free-floating node shape, not a sub-model', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertMindmapNode(page)

    // It renders through ShapeView: an empty root shows the muted "New idea" placeholder.
    await expect(page.getByText('New idea', { exact: true }).first()).toBeVisible()
    await expect
      .poll(async () => {
        const doc = await diagram.saved(name)
        return { shapes: nodesOf(doc, 'mindmap-node').length, submodel: doc.mindmap.nodes.length }
      }, {
        message: 'a mind-map insert did not persist a single free-floating root shape',
        timeout: 20_000,
      })
      .toEqual({ shapes: 1, submodel: 0 })

    const doc = await diagram.saved(name)
    expect(nodesOf(doc, 'mindmap-node')[0].mindmap.isRoot, 'the inserted node is a real root').toBe(true)
    expect(doc.connectors, 'a lone root wires no branch').toHaveLength(0)
  })

  test('the inserted mind-map node shows its "+" add-handles, and Tab grows a child', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertMindmapNode(page) // the new root is auto-selected
    // The mouse affordance appears for the sole-selected node (#118).
    await expect(mindmapAddHandles(page).first()).toBeVisible()

    await page.keyboard.press('Tab') // the keyboard grows a child from the selected node

    await expect
      .poll(async () => (await diagram.saved(name)).shapes.filter((s) => s.role === 'mindmap-node').length, {
        message: 'Tab on a free-floating mind-map node did not add a child shape',
        timeout: 20_000,
      })
      .toBe(2)
    const doc = await diagram.saved(name)
    expect(
      doc.connectors.some((c) => c.role === 'mindmap-branch'),
      'the child is bound to its parent by a branch connector',
    ).toBe(true)
  })

  // #48: a second insert used to graft a branch onto the existing root. Every insert is
  // now its own independent shape.
  test('a second mind-map insert is its own node, not a branch of the first', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertMindmapNode(page)
    await expect
      .poll(async () => (await diagram.saved(name)).shapes.filter((s) => s.role === 'mindmap-node').length, { timeout: 20_000 })
      .toBe(1)
    await insertMindmapNode(page)

    await expect
      .poll(async () => {
        const roots = (await diagram.saved(name)).shapes.filter(
          (s) => s.role === 'mindmap-node' && s.mindmap.isRoot,
        )
        return roots.length
      }, {
        message: 'the second mind-map insert grew the first instead of adding its own node',
        timeout: 20_000,
      })
      .toBe(2)
    expect((await diagram.saved(name)).mindmap.nodes, 'the retired sub-model stays empty').toEqual([])
  })

  test('inserting a flowchart node adds one free-floating node shape, not a sub-model', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertFlowchartNode(page)

    // It renders through ShapeView with the Terminator's default "Start" label.
    await expect(page.getByText('Start', { exact: true }).first()).toBeVisible()
    await expect
      .poll(async () => {
        const doc = await diagram.saved(name)
        return { shapes: nodesOf(doc, 'flowchart-node').length, submodel: doc.flowchart.nodes.length }
      }, {
        message: 'a flowchart insert did not persist a single free-floating node shape',
        timeout: 20_000,
      })
      .toEqual({ shapes: 1, submodel: 0 })
    expect((await diagram.saved(name)).connectors, 'a lone node wires no edge').toHaveLength(0)
  })

  test('the inserted flowchart node shows its "+" add-handle, and Enter grows a step', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertFlowchartNode(page) // auto-selected
    await expect(flowchartAddHandles(page).first()).toBeVisible()

    await page.keyboard.press('Enter') // Enter adds a connected Process step below (#77)

    await expect
      .poll(async () => (await diagram.saved(name)).shapes.filter((s) => s.role === 'flowchart-node').length, {
        message: 'Enter on a free-floating flowchart node did not add a connected step',
        timeout: 20_000,
      })
      .toBe(2)
    const doc = await diagram.saved(name)
    expect(
      doc.connectors.some((c) => c.role === 'flowchart-edge'),
      'the new step is joined by a flow edge',
    ).toBe(true)
  })

  test('a second flowchart insert is its own node, unconnected to the first', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertFlowchartNode(page)
    await expect
      .poll(async () => (await diagram.saved(name)).shapes.filter((s) => s.role === 'flowchart-node').length, { timeout: 20_000 })
      .toBe(1)
    await insertFlowchartNode(page)

    await expect
      .poll(async () => (await diagram.saved(name)).shapes.filter((s) => s.role === 'flowchart-node').length, {
        message: 'the second flowchart insert extended the first instead of adding its own node',
        timeout: 20_000,
      })
      .toBe(2)
    const doc = await diagram.saved(name)
    expect(doc.connectors, 'two independent inserts wire no edge between them').toHaveLength(0)
    expect(doc.flowchart.nodes, 'the retired sub-model stays empty').toEqual([])
  })

  // Marquee + delete treat the migrated nodes as ordinary canvas shapes.
  test('a marquee selects the inserted nodes, and Delete removes them from shapes[]', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertMindmapNode(page)
    await insertMindmapNode(page) // two independent roots, both centred in view
    let ids = []
    await expect
      .poll(async () => {
        ids = (await diagram.saved(name)).shapes.filter((s) => s.role === 'mindmap-node').map((s) => s.id)
        return ids.length
      }, { timeout: 20_000 })
      .toBe(2)

    // The document is otherwise empty, so a marquee enclosing both nodes rubber-bands
    // exactly them; Delete then acts on the whole selection.
    await marqueeOver(page, ids.map((id) => ffShape(page, id)), 'inserted mind-map node')
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => (await diagram.saved(name)).shapes.filter((s) => s.role === 'mindmap-node').length, {
        message: 'a marquee + Delete did not remove the free-floating mind-map shapes',
        timeout: 20_000,
      })
      .toBe(0)
  })
})

test.describe('unified canvas: navigator', () => {
  test('the minimap reflects both block and whiteboard content and pans', async ({
    page,
    diagram,
  }) => {
    await diagram.open('unified') // seeded with shapes AND a stroke + sticky
    await expect(minimap(page)).toBeVisible()

    // Whiteboard ink must appear in the unified navigator, not just block shapes —
    // a known gap a later change fixed, so it needs a regression guard. Minimap.vue
    // maps whiteboard objects through whiteboardObjectBoxes and draws them as BOXES
    // (unlike WhiteboardMinimap, which draws real polylines), so compare item counts
    // between a document with ink and one without rather than looking for polylines.
    const withInk = await page.locator('[aria-label="Minimap"] svg rect').count()
    await diagram.open('block') // shapes only, no whiteboard model at all
    const withoutInk = await page.locator('[aria-label="Minimap"] svg rect').count()
    expect(
      withInk,
      'unified minimap draws no more than the block-only one, so whiteboard content is missing',
    ).toBeGreaterThan(withoutInk)
    await diagram.open('unified')

    const before = await canvasTransform(page)
    await clickMinimap(page, 140, 95)
    await expect
      .poll(() => canvasTransform(page), { message: 'minimap click did not pan' })
      .not.toBe(before)
  })
})

test.describe('unified canvas: hygiene', () => {
  test('a full editing session raises no uncaught errors', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    await diagram.open('unified', { empty: true })

    // Exercise both catalog paths and a bar tool. Each catalog helper closes the
    // panel before it returns, so arming the pen and then dragging a shape never
    // races the popover open against its own close.
    await armCreateToolFromCatalog(page, 'pen-line')
    await dragOnCanvas(page, { x: 260, y: 240 }, { x: 520, y: 380 }, 10)
    await dragShapeFromCatalog(page, { x: 420, y: 300 })
    await toolByIcon(page, 'mouse-pointer').click()
    await clickEmptyCanvas(page)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(1500)

    expect(errors.pageErrors, 'editing raised uncaught exceptions').toEqual([])
    expect(errors.failures, 'editing made requests that failed').toEqual([])
  })
})
