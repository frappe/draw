import { test, expect } from '../helpers/fixtures.js'
import { POPOVER, surfaceBox } from '../helpers/editor.js'

// Pen, eraser, sticky and line each arm AND open their options popover on one
// click now, and a repeat click on the same tool toggles the popover shut again
// (see WhiteboardTools.vue). Greptile flagged this click composition as
// untested: a regression here would leave the wrong options open, or break
// toggling, with nothing to catch it. It already broke the SAME area once in
// this codebase's history — the pre-existing armDraw() e2e helper still clicked
// a separate 'sliders' button this change removed, which this fix also repairs.
test.describe('whiteboard option-tool popovers', () => {
  const wtool = (page, tool) => page.getByTestId(`wtool-${tool}`)

  test('a click arms the tool and opens its popover; a repeat click closes it without disarming', async ({
    page,
    diagram,
  }) => {
    await diagram.open('whiteboard', { empty: true })

    const sticky = wtool(page, 'sticky')
    await sticky.click()
    await expect(sticky).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(POPOVER).getByText('Color', { exact: true })).toBeVisible()

    // Re-arming the already-active tool is a no-op for the tool state, but the
    // trigger's own click still toggles ITS popover shut.
    await sticky.click()
    await expect(page.locator(POPOVER)).toBeHidden()
    await expect(sticky, 'closing the popover must not disarm the tool').toHaveAttribute('aria-pressed', 'true')

    // A third click re-opens it.
    await sticky.click()
    await expect(page.locator(POPOVER).getByText('Color', { exact: true })).toBeVisible()
  })

  test('switching directly between two option tools swaps the popover content in one click', async ({
    page,
    diagram,
  }) => {
    await diagram.open('whiteboard', { empty: true })

    await wtool(page, 'pen').click()
    await expect(page.locator(POPOVER).getByText('Opacity', { exact: true })).toBeVisible()

    // No intermediate close — switching tools while a popover is open must land
    // on the NEW tool's content, not leave the old one showing or close both.
    // The eraser's options read as a MENU since #462, so what opens is its
    // entries — there is no "Mode" heading any more. It is still a Popover, so the
    // one-click swap this test is about still holds for it.
    await wtool(page, 'eraser').click()
    await expect(page.locator(POPOVER).getByText('Erase by object', { exact: true })).toBeVisible()
    await expect(page.locator(POPOVER).getByText('Opacity', { exact: true })).toBeHidden()
    await expect(wtool(page, 'pen')).toHaveAttribute('aria-pressed', 'false')
    await expect(wtool(page, 'eraser')).toHaveAttribute('aria-pressed', 'true')

    await wtool(page, 'line').click()
    await expect(page.locator(POPOVER).getByText('Start', { exact: true })).toBeVisible()
    await expect(page.locator(POPOVER).getByText('Erase by object', { exact: true })).toBeHidden()
  })

  // The Draw panel opens WITH the tool, so it is open exactly when the user goes to
  // draw. #495 put the full Espresso grid in it — ten rows of swatches — and the
  // panel grew to 417px tall, far enough down the screen to cover the middle of the
  // board: `stroke-opacity.spec.js` draws at 35% of the surface height and its
  // strokes stopped committing. That spec and `legacy-types.spec.js` both work
  // around it by clicking the tool again to shut the panel first.
  //
  // Vibhav's call (17 Aug 2026): a short row of inks, which brought the panel to
  // 181px.
  //
  // A panel of ANY height covers the canvas directly beneath it, so this does not
  // ask for no overlap — it asks that the panel stay out of the region people draw
  // in. 35% of the surface height is that region by precedent: it is where
  // stroke-opacity.spec.js draws, and it is what the grid grew far enough to cover.
  // The bound is read from the live layout rather than hard-coded, so the test says
  // "the panel ends above the stroke" instead of carrying a pixel count that would
  // rot the first time the toolbar moves.
  test('the Draw panel stays clear of the canvas people draw on', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { empty: true })

    // The committed stroke, matched on the default ink exactly as stroke-opacity.spec
    // does. A bare `path[stroke]` would also match canvas furniture, so the assertion
    // could pass without a stroke ever being drawn — the one failure this test is for.
    const strokes = page.locator('[role="application"] path[stroke="#171717"]')

    await wtool(page, 'pen').click()
    await expect(page.locator(POPOVER).getByText('Opacity', { exact: true })).toBeVisible()
    await expect(strokes, 'the document was not empty, so drawing proves nothing').toHaveCount(0)

    const box = await surfaceBox(page)
    const y = box.y + box.height * 0.35
    const panel = await page.locator(POPOVER).first().boundingBox()
    expect(panel.y + panel.height, 'the Draw panel reaches into the drawing area again').toBeLessThan(y)

    await page.mouse.move(box.x + 150, y)
    await page.mouse.down()
    for (let i = 1; i <= 5; i += 1) await page.mouse.move(box.x + 150 + i * 60, y)
    await page.mouse.up()

    await expect(strokes, 'the panel swallowed the stroke — it is covering the canvas again').toHaveCount(1)
  })
})
