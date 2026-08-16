import { test, expect } from '../helpers/fixtures.js'
import { POPOVER } from '../helpers/editor.js'

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
})
