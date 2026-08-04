import { test, expect } from '../helpers/fixtures.js'
import { SURFACE } from '../helpers/editor.js'

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
})
