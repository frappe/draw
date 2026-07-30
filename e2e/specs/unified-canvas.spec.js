import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import {
  SURFACE,
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
  enterFrame,
  backToCanvas,
} from '../helpers/editor.js'

// The unified canvas is where the four diagram types were merged onto one surface,
// and where functionality that used to work regressed. Each test here asserts on the
// PERSISTED document wherever it can, not just on rendered pixels — a tool that
// draws something transient but never saves it looks fine on screen and is broken.


// Open the Insert menu and pick an item. The item is awaited for visibility first:
// clicking straight after opening the popover can land while it is still settling,
// which misses silently and then looks like a broken inserter.
async function insertFromMenu(page, label) {
  await toolByIcon(page, 'layout-template').click()
  const item = page.getByRole('button', { name: new RegExp(`^${label}$`) }).first()
  await item.waitFor({ state: 'visible' })
  await item.click()
  // The handler closes the popover, so this also proves the click was delivered.
  await expect(item).toBeHidden()
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
})

test.describe('unified canvas: frames', () => {
  test('Insert adds a mind-map starter frame', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertFromMenu(page, 'Mind map')

    await expect
      .poll(async () => (await diagram.saved(name)).mindmap.nodes.length, {
        message: 'Insert > Mind map seeded no nodes',
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
    await expect(page.locator('.fd-mm-label').first()).toBeVisible()
  })

  test('Insert adds a flowchart starter frame', async ({ page, diagram }) => {
    const name = await diagram.open('unified', { empty: true })

    await insertFromMenu(page, 'Flowchart')

    await expect
      .poll(async () => (await diagram.saved(name)).flowchart.nodes.length, {
        message: 'Insert > Flowchart seeded no nodes',
        timeout: 20_000,
      })
      .toBeGreaterThan(0)
  })

  test('a seeded mind-map frame renders on the unified canvas', async ({ page, diagram }) => {
    await diagram.open('unified', { withFrames: true })
    // Frames render at their origin; all four seeded nodes should be present.
    await expect(page.locator('.fd-mm-label')).toHaveCount(4)
  })

  test('double-clicking a mind-map frame enters in-frame editing', async ({ page, diagram }) => {
    await diagram.open('unified', { framesInView: true })

    // NEVER assert this with getByText(/editing/i). The `diagram` fixture names each
    // document after the test that created it, so that pattern matched THIS TEST'S
    // OWN TITLE in the editor header — it passed no matter what the double-click did,
    // including when the frame sat below the fold and nothing happened at all.
    await enterFrame(page, 'Branch A')
    await expect(backToCanvas(page)).toBeVisible()
  })

  test('double-clicking a flowchart frame enters in-frame editing', async ({ page, diagram }) => {
    // The flowchart frame wrapped its content in an inline pointer-events:none, which
    // the viewport's [&_*]:pointer-events-auto overrode — so the double-click hit the
    // node instead of the frame's hit-rect and the frame could not be entered at all.
    await diagram.open('unified', { framesInView: true })

    const node = page.getByText('Do work', { exact: true }).first()
    const box = await node.boundingBox()
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)

    await expect(backToCanvas(page), 'a flowchart frame could not be entered').toBeVisible({
      timeout: 10_000,
    })
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
