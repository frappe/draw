import { test, expect } from '../helpers/fixtures.js'
import { SURFACE, TOOLBAR, armShapeFromCatalog, dragOnCanvas } from '../helpers/editor.js'

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
})
