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
  TOOLBAR,
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
    // The toolbar itself is always on screen, so assert on a control that only a
    // selected node puts in it. Cross-link is single-selection only, which makes
    // it a precise witness that exactly one node is selected.
    const crosslinkButton = buttonByIcon(page, 'link-2', page.locator(TOOLBAR))
    await expect(crosslinkButton).toBeVisible()

    // Navigating to another node keeps a single node selected; the point is that
    // arrow nav does not clear the selection or throw.
    await page.keyboard.press('ArrowDown')
    await expect(crosslinkButton).toBeVisible()
  })

  test('a cross-link can be created, selected and deleted', async ({ page, diagram }) => {
    const name = await diagram.open('mindmap')
    await clickNode(page, 'Branch A')

    await buttonByIcon(page, 'link-2', page.locator(TOOLBAR)).click()
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

    await buttonByIcon(page, 'crosshair', page.locator(TOOLBAR)).click()
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

// Pen and highlighter are ONE "Draw" tool now (#242) — there is no separate
// highlighter button to click. Arming Draw opens its options popover directly
// (no separate 'sliders' click, matching the eraser's own arm-opens-options
// pattern below), so pick the ink straight from there, then close the popover
// again so it can't sit over the canvas the drag needs to reach.
async function armDraw(page, kind) {
  await page.getByTestId('wtool-pen').click()
  // Plain buttons since #497 took the ink picker off TabButtons — which rendered
  // each tab through reka-ui's RadioGroupItem, so they used to be role="radio".
  // TabButtons hard-codes the native browser `title`, and nothing a consumer passes
  // turns that off, so the only way off it was off the component. The control keeps
  // its single-choice meaning through aria-pressed, matching every other segmented
  // row in the app (the connector menu's, Home's view toggle).
  const ink = page
    .locator(POPOVER)
    .getByRole('button', { name: kind === 'highlighter' ? 'Highlighter' : 'Pen', exact: true })
  await ink.waitFor({ state: 'visible' })
  await ink.click()
  // Dismiss by clicking the tool itself: re-arming the already-active tool is a
  // no-op, but the trigger's own click still toggles its popover shut (mirrors
  // the eraser's object-mode dismissal above).
  await page.getByTestId('wtool-pen').click()
  await expect(page.locator(POPOVER)).toBeHidden()
}

test.describe('whiteboard', () => {
  test('the pen draws a stroke that persists', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })
    await armDraw(page, 'pen')
    await dragOnCanvas(page, { x: 300, y: 250 }, { x: 620, y: 400 }, 14)

    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.strokes.length, { timeout: 20_000 })
      .toBeGreaterThan(0)
  })

  test('the Draw tool\'s highlighter ink records a distinct stroke kind', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })
    await armDraw(page, 'highlighter')
    await dragOnCanvas(page, { x: 280, y: 300 }, { x: 600, y: 320 }, 12)

    // The persisted stroke.kind is what the merge had to preserve: the tool
    // collapsed to one button, but the document schema still distinguishes the two.
    await expect
      .poll(async () => {
        const strokes = (await diagram.saved(name)).whiteboard.strokes
        return strokes.length && strokes[strokes.length - 1].kind
      }, { message: 'the highlighter ink did not record a highlighter-kind stroke', timeout: 20_000 })
      .toBe('highlighter')
  })

  // The eraser's options read as a MENU since #462: Eraser, Erase by object, Clear
  // all. A mode has to be picked before rubbing, and the plain eraser is reached
  // through a tip SIZE — "Eraser" opens the three sizes in place, and picking one is
  // what arms ink mode.
  //
  // It is still a Popover, so it never blocks the canvas; picking a mode closes it.
  async function armEraser(page, mode) {
    await toolByIcon(page, 'eraser').click()
    const menu = page.locator(POPOVER)
    if (mode === 'object') {
      await menu.getByText('Erase by object', { exact: true }).click()
    } else {
      await menu.getByText('Eraser', { exact: true }).click()
      await menu.getByText('Medium', { exact: true }).click()
    }
    // If the tool were disarmed the assertions below would blame the eraser for a
    // gesture that never reached it. Toolbar controls carry active state on
    // aria-pressed rather than a class (#360).
    await expect(toolByIcon(page, 'eraser')).toHaveAttribute('aria-pressed', 'true')
  }

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

    await armEraser(page, 'ink')
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

    // Object mode is one entry on the eraser's menu (#462). Picking it closes the
    // menu and leaves the tool armed, so there is no popover left to dismiss — which
    // is what the old "click the tool again" step was for. Never Escape: it is
    // universal and resets the tool to select before any per-mode handling, so it
    // would disarm the eraser and the drag below would silently become a marquee.
    await armEraser(page, 'object')

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

    // Both Draw inks, then the tools that are still their own buttons (#242).
    for (const kind of ['pen', 'highlighter']) {
      await armDraw(page, kind)
      await dragOnCanvas(page, { x: 300, y: 260 }, { x: 520, y: 360 }, 8)
    }
    for (const icon of ['sticky-note', 'eraser']) {
      await toolByIcon(page, icon).click()
      await dragOnCanvas(page, { x: 300, y: 260 }, { x: 520, y: 360 }, 8)
    }
    await page.waitForTimeout(1500)

    expect(errors.pageErrors).toEqual([])
    expect(errors.failures).toEqual([])
  })
})
