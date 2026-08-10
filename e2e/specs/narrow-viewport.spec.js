import { test, expect } from '../helpers/fixtures.js'
import {
  SURFACE,
  TOOLBAR,
  POPOVER,
  armShapeFromCatalog,
  dragOnCanvas,
  insertMindmapNode,
} from '../helpers/editor.js'

// #175: below design/SPEC.md's stated 1280px minimum, the minimap overlapped the tool
// palette and stole its pointer events, and the header overflowed the viewport — an
// editor that LOOKED usable but wasn't. The fix gates the whole editor on width instead
// of trying to reflow chrome that was never designed for it.

test.describe('editor at a phone width (390px), fresh load', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('shows the "open on a larger screen" notice instead of the editor', async ({ page, diagram }) => {
    // Not diagram.open(): that helper waits for the canvas to appear, which is
    // exactly what the fix prevents at this width — create via API, then
    // navigate directly.
    const name = await diagram.create('block')
    await page.goto(`/draw/d/${name}`)

    await expect(page.getByRole('heading', { name: 'Open on a larger screen' })).toBeVisible()
    await expect(page.locator(SURFACE)).toHaveCount(0)
  })

  test('offers a way back to the library', async ({ page, diagram }) => {
    const name = await diagram.create('block')
    await page.goto(`/draw/d/${name}`)
    await page.getByRole('button', { name: 'Go to Frappe Draw' }).click()

    await expect(page).toHaveURL(/\/draw\/?$/)
  })
})

test.describe('editor at the supported minimum width (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('renders the full editor, not the narrow-width notice', async ({ page, diagram }) => {
    await diagram.open('block')

    await expect(page.locator(SURFACE).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Open on a larger screen' })).toHaveCount(0)
  })

  // The toolbar was designed to GROUP into dropdowns rather than scroll: the
  // product decision was that no control is ever hidden behind a sideways swipe.
  // `overflow-x-auto` is a safety net on the wrapper, so an overflow would be
  // silent — the bar would simply start scrolling and nobody would notice until
  // a user could not find a control. This asserts the decision, not the net.
  test('the toolbar does not overflow with a shape selected', async ({ page, diagram }) => {
    await diagram.open('unified')
    await armShapeFromCatalog(page)
    await dragOnCanvas(page, { x: 260, y: 220 }, { x: 420, y: 330 })

    const bar = page.locator(TOOLBAR)
    await expect(bar.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    const overflow = await bar.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow, 'the canvas toolbar overflowed at the 1280px minimum').toBe(0)
  })

  // The densest state the bar can reach, and the one to measure: a
  // multi-selection on a unified document that includes a mind-map node. The
  // multi-selection is what brings the align and distribute work, and the map
  // node adds Tidy up on top of it. Measuring a single selected shape left about
  // 96px of the real worst case untested.
  test('the toolbar does not overflow in its densest state', async ({ page, diagram }) => {
    await diagram.open('unified', { empty: true })
    await armShapeFromCatalog(page)
    await dragOnCanvas(page, { x: 260, y: 220 }, { x: 380, y: 320 })
    await armShapeFromCatalog(page)
    await dragOnCanvas(page, { x: 460, y: 220 }, { x: 580, y: 320 })
    await insertMindmapNode(page) // the new root drops straight into text edit (#263)

    // Escape leaves that editor, and select-all must not run until it has: while
    // a label is being edited the bar shows the text-only menu (#259) and ⌘A
    // selects the TEXT, not the canvas. Arrange coming back IS the edit
    // committing, so it is the signal to wait on rather than a sleep.
    const bar = page.locator(TOOLBAR)
    const arrange = bar.getByRole('button', { name: 'Arrange', exact: true })
    await page.keyboard.press('Escape')
    await expect(arrange).toBeVisible()
    await page.keyboard.press('Meta+a')
    await expect(bar.getByRole('button', { name: 'Tidy up', exact: true })).toBeVisible()

    // Everything really is selected. There is no longer a control that appears
    // ONLY for a multi-selection — folding those four into the Arrange menu is
    // what bought the room this test measures — so the proof is inside it: the
    // Align section renders only when at least two shapes are selected.
    await arrange.click()
    await expect(page.locator(POPOVER).getByText('Align', { exact: true })).toBeVisible()
    await arrange.click()
    await expect(page.locator(POPOVER)).toBeHidden()

    // Both halves matter. Flex items shrink by default, so a bar one control too
    // wide can squeeze its buttons narrower and report no overflow at all —
    // which is why ToolbarButton carries shrink-0 and why this checks the
    // rendered widths as well as the scroll width.
    const measured = await bar.evaluate((el) => ({
      overflow: el.scrollWidth - el.clientWidth,
      width: el.clientWidth,
      squashed: [...el.querySelectorAll('button')]
        .filter((button) => button.scrollWidth > button.clientWidth)
        .map((button) => button.getAttribute('aria-label')),
    }))
    expect(
      measured.overflow,
      `the canvas toolbar wanted ${measured.width + measured.overflow}px of the 1280px minimum. ` +
        'Something added to the bar has to be folded into a menu — see design/CONVENTIONS.md.',
    ).toBe(0)
    expect(measured.squashed, 'controls were squeezed instead of overflowing').toEqual([])
  })
})
