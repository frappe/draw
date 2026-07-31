import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import {
  SURFACE,
  POPOVER,
  buttonByIcon,
  toolByIcon,
  openShapesPopover,
  dragTileToCanvas,
  dragOnCanvas,
  clickCanvas,
  clickEmptyCanvas,
  minimap,
  clickMinimap,
  canvasTransform,
} from '../helpers/editor.js'

// The unified canvas is where the four diagram types were merged onto one surface,
// and where functionality that used to work regressed. Each test here asserts on the
// PERSISTED document wherever it can, not just on rendered pixels — a tool that
// draws something transient but never saves it looks fine on screen and is broken.


// Insert a starter frame. The Insert menu is gone (#44): the mind-map and
// flowchart tiles live in the Shapes popover's last section, and the tiles are
// icon-only, so they're found by glyph like every other tool button. The tile is
// awaited for visibility first: clicking straight after opening the popover can
// land while it is still settling, which misses silently and then looks like a
// broken inserter.
async function insertFrame(page, icon) {
  await openShapesPopover(page)
  const tile = buttonByIcon(page, icon, page.locator(POPOVER))
  await tile.waitFor({ state: 'visible' })
  await tile.click()
  // The handler closes the popover, so this also proves the click was delivered.
  await expect(tile).toBeHidden()
}

test.describe('unified canvas: block tools', () => {
  test('dragging a palette tile creates a persisted shape', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await openShapesPopover(page)
    const { payload } = await dragTileToCanvas(page, { x: 500, y: 320 })
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

    const tiles = await openShapesPopover(page)
    await tiles.first().click() // arms draw mode for that shape
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
})

test.describe('unified canvas: whiteboard tools', () => {
  test('the pen draws a stroke that persists', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    // WhiteboardTools declares its own icon for each tool ('pen-line'), which differs
    // from the name in modeStrategies.js ('edit-2') — see the note in the audit report.
    await toolByIcon(page, 'pen-line').click()
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

    await toolByIcon(page, 'sticky-note').click()
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
})

test.describe('unified canvas: frames', () => {
  test('Shapes adds a mind-map starter frame', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertFrame(page, 'git-fork')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, {
        message: 'Shapes > Mind map seeded no nodes',
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
    await expect(page.locator('.fd-mm-label').first()).toBeVisible()
  })

  test('Shapes adds a flowchart starter frame', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertFrame(page, 'workflow')

    await expect
      .poll(async () => (await diagram.saved(name)).flowchart.nodes.length, {
        message: 'Shapes > Flowchart seeded no nodes',
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
  })

  test('a seeded mind-map frame renders on the unified canvas', async ({ page, diagram }) => {
    await diagram.open('unified', { withFrames: true })
    // Frames render at their origin; all four seeded nodes should be present.
    await expect(page.locator('.fd-mm-label')).toHaveCount(4)
  })

  // A mind map / flowchart on the unified canvas is an ordinary canvas object: its
  // hit-rect covers the padded content bbox and is painted BEHIND the live content, so
  // a press on the object's empty margin grabs the whole thing while a press on a node
  // edits that node (#45). Operations on the content itself live in
  // unified-objects.spec.js; these two cover the object-level gesture.
  //
  // The press lands 4px inside the bbox corner, which is inside the 12px pad and
  // therefore guaranteed to miss every node. Asserted on the persisted origin — the
  // object visibly following the cursor while nothing saves is exactly this app's
  // characteristic failure.
  for (const kind of ['mindmap', 'flowchart']) {
    test(`dragging a ${kind} object's margin moves it, and the move persists`, async ({ page, diagram }) => {
      const name = await diagram.open('unified', { framesInView: true })
      const before = (await diagram.saved(name))[kind].origin

      // Both objects draw the same dashed hit-rect; they render mind map first.
      const rect = page.locator('rect[stroke-dasharray="6 4"]').nth(kind === 'mindmap' ? 0 : 1)
      const box = await rect.boundingBox()
      if (!box) throw new Error(`the ${kind} object's hit-rect is not rendered`)
      const { width, height } = page.viewportSize()
      // Only the corner has to be reachable — page.mouse ignores out-of-window
      // coordinates, and these bboxes can extend past the fold.
      if (box.x + 4 > width || box.y + 4 > height || box.x < 0 || box.y < 0) {
        throw new Error(`the ${kind} object's corner is outside the ${width}x${height} window`)
      }

      await page.mouse.move(box.x + 4, box.y + 4)
      await page.mouse.down()
      await page.mouse.move(box.x + 64, box.y + 44, { steps: 12 })
      await page.mouse.up()

      await expect
        .poll(async () => {
          const after = (await diagram.saved(name))[kind].origin
          return after.x !== before.x || after.y !== before.y
        }, {
          message: `dragging the ${kind} object did not persist a new origin`,
          timeout: 20_000,
        })
        .toBe(true)
    })
  }
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

    await openShapesPopover(page)
    await dragTileToCanvas(page, { x: 420, y: 300 })
    await toolByIcon(page, 'pen-line').click()
    await dragOnCanvas(page, { x: 260, y: 240 }, { x: 520, y: 380 }, 10)
    await toolByIcon(page, 'mouse-pointer').click()
    await clickEmptyCanvas(page)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(1500)

    expect(errors.pageErrors, 'editing raised uncaught exceptions').toEqual([])
    expect(errors.failures, 'editing made requests that failed').toEqual([])
  })
})
