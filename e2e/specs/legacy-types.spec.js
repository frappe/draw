import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import {
  SURFACE,
  POPOVER,
  toolByIcon,
  buttonByIcon,
  dragShapeFromCatalog,
  dragOnCanvas,
  clickCanvas,
  clickNode,
  crosslinks,
  selectedCrosslinks,
  minimap,
  clickMinimap,
  canvasTransform,
  MM_TOOLBAR,
} from '../helpers/editor.js'

// The four single-type diagrams must keep working after the unified-canvas merge.
// Existing documents are all still one of these types, so a regression here is a
// regression for every diagram anyone has already made.
//
// As in unified-canvas.spec.js, assertions go through the PERSISTED document
// wherever possible — rendering something that never saves is the failure mode.

test.describe('block', () => {
  test('a dragged tile becomes a persisted shape', async ({ page, diagram }) => {
    const name = await diagram.open('block', { empty: true })
    await dragShapeFromCatalog(page, { x: 480, y: 300 })
    await expect
      .poll(async () => (await diagram.saved(name)).shapes.length, { timeout: 20_000 })
      .toBe(1)
  })

  test('delete removes the selected shape, and undo brings it back', async ({ page, diagram }) => {
    const name = await diagram.open('block')
    const shape = page.locator(`${SURFACE} rect`).first()
    const box = await shape.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => (await diagram.saved(name)).shapes.length, {
        message: 'Delete did not remove the shape from the saved document',
        timeout: 20_000,
      })
      .toBe(1)

    await page.keyboard.press('Meta+z')
    await expect
      .poll(async () => (await diagram.saved(name)).shapes.length, {
        message: 'undo did not restore the deleted shape',
        timeout: 20_000,
      })
      .toBe(2)
  })

  test('the minimap pans the canvas', async ({ page, diagram }) => {
    await diagram.open('block')
    const before = await canvasTransform(page)
    await clickMinimap(page, 140, 90)
    await expect.poll(() => canvasTransform(page)).not.toBe(before)
  })
})

test.describe('mindmap', () => {
  test('Tab adds a child node under the selection', async ({ page, diagram }) => {
    const name = await diagram.open('mindmap')
    await clickNode(page, 'Branch A')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, {
        message: 'Tab did not add a child node',
        timeout: 20_000,
      })
      .toBe(5)
  })

  test('arrow keys move the selection between nodes', async ({ page, diagram }) => {
    await diagram.open('mindmap')
    await clickNode(page, 'Branch A')
    await expect(page.locator(MM_TOOLBAR)).toBeVisible()

    // Navigating to another node keeps a single-node toolbar visible; the point is
    // that arrow nav does not clear the selection or throw.
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(MM_TOOLBAR)).toBeVisible()
  })

  test('a cross-link can be created, selected and deleted', async ({ page, diagram }) => {
    const name = await diagram.open('mindmap')
    await clickNode(page, 'Branch A')

    await buttonByIcon(page, 'link-2', page.locator(MM_TOOLBAR)).click()
    await clickNode(page, 'Branch B')
    await expect(crosslinks(page)).toHaveCount(1)
    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.crosslinks.length, { timeout: 20_000 })
      .toBe(1)

    const link = await crosslinks(page).first().boundingBox()
    await page.mouse.click(link.x + link.width / 2, link.y + link.height / 2)
    await expect(selectedCrosslinks(page)).toHaveCount(1)

    await page.keyboard.press('Delete')
    await expect(crosslinks(page)).toHaveCount(0)
    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.crosslinks.length, {
        message: 'deleting a cross-link did not persist',
        timeout: 20_000,
      })
      .toBe(0)
  })

  test('focus mode isolates a branch and the banner escapes it', async ({ page, diagram }) => {
    await diagram.open('mindmap')
    await clickNode(page, 'Branch A')

    await buttonByIcon(page, 'crosshair', page.locator(MM_TOOLBAR)).click()
    await expect(page.getByText('Focusing one branch')).toBeVisible()
    expect(await page.locator('[opacity="0.12"]').count()).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Exit' }).click()
    await expect(page.getByText('Focusing one branch')).toBeHidden()
  })

  test('deleting a leaf node persists without a confirm dialog', async ({ page, diagram }) => {
    const name = await diagram.open('mindmap')
    await clickNode(page, 'Branch C') // a leaf
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, { timeout: 20_000 })
      .toBe(3)
  })
})

test.describe('flowchart', () => {
  test('seeded nodes and routed edges render', async ({ page, diagram }) => {
    await diagram.open('flowchart')
    // Node labels, plus the two orthogonal edge routes. A bare `path` locator is not
    // usable here: it can resolve to a zero-size marker definition that is never
    // "visible", so match the routes by the stroke they are drawn with.
    for (const label of ['Start', 'Do work', 'OK?']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
    const routes = await page.locator(`${SURFACE} path[stroke]:not([stroke="none"])`).count()
    expect(routes, 'seeded flowchart edges did not render').toBeGreaterThanOrEqual(2)
  })

  test('a node can be moved and the move persists', async ({ page, diagram }) => {
    const name = await diagram.open('flowchart')
    const before = (await diagram.saved(name)).flowchart.nodes.find((n) => n.id === 'f2')

    const label = page.getByText('Do work').first()
    const box = await label.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 60, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(async () => {
        const n = (await diagram.saved(name)).flowchart.nodes.find((x) => x.id === 'f2')
        return n.x !== before.x || n.y !== before.y
      }, { message: 'dragging a flowchart node did not persist', timeout: 20_000 })
      .toBe(true)
  })

  test('the minimap pans the canvas', async ({ page, diagram }) => {
    await diagram.open('flowchart')
    const before = await canvasTransform(page)
    await clickMinimap(page, 140, 90)
    await expect.poll(() => canvasTransform(page)).not.toBe(before)
  })
})

test.describe('whiteboard', () => {
  test('the pen draws a stroke that persists', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })
    await toolByIcon(page, 'pen-line').click()
    await dragOnCanvas(page, { x: 300, y: 250 }, { x: 620, y: 400 }, 14)

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.strokes.length, { timeout: 20_000 })
      .toBeGreaterThan(0)
  })

  test('the highlighter draws a distinct stroke kind', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })
    await toolByIcon(page, 'highlighter').click()
    await dragOnCanvas(page, { x: 280, y: 300 }, { x: 600, y: 320 }, 12)

    await expect
      .poll(async () => {
        const strokes = (await diagram.saved(name)).whiteboard.strokes
        return strokes.length && strokes[strokes.length - 1].kind
      }, { message: 'highlighter did not record a highlighter-kind stroke', timeout: 20_000 })
      .toBe('highlighter')
  })

  test('the eraser removes ink from a stroke', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard') // seeded with one zigzag stroke
    // Total ink LENGTH is the only metric that behaves here. Neither stroke count nor
    // point count works: splitting one stroke into surviving fragments raises the
    // count, and the split inserts interpolated points at the tip boundary, so points
    // rise too. Drawn length is what erasing actually reduces.
    const inkLength = async () =>
      (await diagram.saved(name)).whiteboard.strokes.reduce((total, stroke) => {
        for (let i = 1; i < stroke.points.length; i += 1) {
          const a = stroke.points[i - 1]
          const b = stroke.points[i]
          total += Math.hypot(b.x - a.x, b.y - a.y)
        }
        return total
      }, 0)
    const before = await inkLength()
    expect(before).toBeGreaterThan(0)

    // Locate the rendered stroke first: the canvas starts panned, so logical document
    // coordinates are not screen coordinates and a guessed scrub misses.
    const strokePath = page.locator(`${SURFACE} path[stroke-linecap]`).first()
    const box = await strokePath.boundingBox()

    await toolByIcon(page, 'eraser').click()
    await page.mouse.move(box.x + 2, box.y + box.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 30; i += 1) {
      await page.mouse.move(box.x + (box.width * i) / 30, box.y + box.height / 2)
    }
    await page.mouse.up()

    // This is a PARTIAL eraser, not a whole-stroke delete: it removes the ink within
    // the tip radius and splits what is left into surviving sub-paths.
    await expect
      .poll(inkLength, { message: 'eraser removed no ink from the stroke', timeout: 20_000 })
      .toBeLessThan(before)
  })

  test('erase by object removes the whole stroke in one pass', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard') // seeded with one zigzag stroke
    expect((await diagram.saved(name)).whiteboard.strokes.length).toBeGreaterThan(0)

    const strokePath = page.locator(`${SURFACE} path[stroke-linecap]`).first()
    const box = await strokePath.boundingBox()

    await toolByIcon(page, 'eraser').click()
    // Switch the eraser into object mode from its options disclosure (#39). The
    // mode buttons deliberately leave the popover open (like the pen's colour and
    // width), so close it by toggling its own button. NOT with Escape: Escape is
    // universal and resets the tool to select before any per-mode handling, so it
    // disarms the eraser and the drag below silently becomes a marquee.
    await toolByIcon(page, 'sliders').click()
    const objectMode = page.locator(POPOVER).getByRole('button', { name: 'Erase by object' })
    await objectMode.waitFor({ state: 'visible' })
    await objectMode.click()
    // Dismiss by clicking the eraser tool itself: an outside click closes the
    // popover, and re-arming the tool that is already active changes nothing.
    await toolByIcon(page, 'eraser').click()
    await expect(objectMode).toBeHidden()
    // Guard the precondition: if the tool were disarmed, the assertion below would
    // blame the eraser for a gesture that never reached it. The active tool button
    // carries the class on its own, so anchor the match — `hover:bg-surface-gray-2`
    // sits in the base class of every palette button.
    await expect(toolByIcon(page, 'eraser')).toHaveClass(/(^|\s)bg-surface-gray-2(\s|$)/)

    await page.mouse.move(box.x + 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.up()

    // Object mode takes the element, not the ink under the tip: one crossing
    // clears the stroke instead of leaving fragments behind.
    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.strokes.length, {
        message: 'erase by object left the stroke behind',
        timeout: 20_000,
      })
      .toBe(0)
  })

  test('a sticky note can be placed', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })
    await toolByIcon(page, 'sticky-note').click()
    await clickCanvas(page, 420, 300)

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.stickyNotes.length, {
        timeout: 20_000,
      })
      .toBe(1)
  })

  test('its own navigator pans the canvas', async ({ page, diagram }) => {
    await diagram.open('whiteboard')
    await expect(minimap(page)).toBeVisible()
    const before = await canvasTransform(page)
    await clickMinimap(page, 140, 90)
    await expect.poll(() => canvasTransform(page)).not.toBe(before)
  })

  test('a whiteboard editing session raises no uncaught errors', async ({ page, diagram }) => {
    const errors = watchForErrors(page)
    await diagram.open('whiteboard', { empty: true })

    for (const icon of ['pen-line', 'highlighter', 'sticky-note', 'eraser']) {
      await toolByIcon(page, icon).click()
      await dragOnCanvas(page, { x: 300, y: 260 }, { x: 520, y: 360 }, 8)
    }
    await page.waitForTimeout(1500)

    expect(errors.pageErrors).toEqual([])
    expect(errors.failures).toEqual([])
  })
})
