import { test, expect } from '../helpers/fixtures.js'
import { SURFACE } from '../helpers/editor.js'

// #173: opening a diagram the user may not read rendered the WHOLE editor anyway —
// canvas, palettes, the title "Untitled diagram" and a green "Saved" indicator — on
// an empty document, while `frappe.client.get` 403'd in the background. Everything
// drawn in there was silently discarded.
//
// A refused load and a name that resolves to nothing take the same client path (the
// document resource fails, `doc` stays null), so a nonexistent name drives the gate
// without provisioning a second user against the bench; the 403 arm of the gate is
// pinned in frontend/src/composables/useDiagramAccess.test.js.

const MISSING = 'no-such-diagram-173'

test.describe('a diagram whose document will not load', () => {
  test('renders the access notice and no canvas at all', async ({ page }) => {
    await page.goto(`/draw/d/${MISSING}`)

    await expect(page.getByRole('heading', { name: "You don't have access to this diagram" })).toBeVisible()
    await expect(page.locator(SURFACE)).toHaveCount(0)
  })

  test('never claims the empty document was saved', async ({ page }) => {
    await page.goto(`/draw/d/${MISSING}`)
    await expect(page.getByRole('heading', { name: "You don't have access to this diagram" })).toBeVisible()

    // The lie the issue is about: a save status for a document that was never loaded
    // and can never be written.
    await expect(page.getByText(/^(Saved|Saving…)$/)).toHaveCount(0)
  })

  test('offers a way back to the library', async ({ page }) => {
    await page.goto(`/draw/d/${MISSING}`)
    await page.getByRole('button', { name: 'Go to Frappe Draw' }).click()

    await expect(page).toHaveURL(/\/draw\/?$/)
  })
})
