import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { SURFACE, buttonByIcon } from '../helpers/editor.js'
import { gotoHome } from '../helpers/api.js'

// A diagram document is UNTRUSTED input. `save_diagram` persists whatever JSON a
// client posts and `parseDiagramDocument` coerces nothing, and diagrams get shared
// with other users and made public — so a document reaches a second person's browser
// exactly as its author wrote it. Two paths take it into the DOM as markup:
//
//   - ShapeView v-html's the rich text (`shape.text.html`) into a foreignObject.
//   - useThumbnail builds SVG by string concatenation, and DiagramTile / TrashView
//     v-html that into the home and trash grids.
//
// Unit tests pin the string outputs; only a real browser proves nothing executes.
// The `hostile` fixture crafts every field that reaches an attribute (see
// e2e/fixtures/documents.js) with payloads that set window.__xss.
async function xssFired(page) {
  return page.evaluate(() => Boolean(window.__xss))
}

test('a hostile document executes nothing in the editor', async ({ page, diagram }) => {
  const errors = watchForErrors(page)

  await diagram.open('hostile')
  await expect(page.locator(SURFACE).first()).toBeVisible()

  expect(await xssFired(page), 'a payload in the document executed in the editor').toBe(false)
  // The document still has to RENDER — a sanitiser that blanked the canvas would
  // also pass the assertion above.
  const drawn = await page.locator(`${SURFACE} rect, ${SURFACE} path`).count()
  expect(drawn, 'the hostile document rendered nothing at all').toBeGreaterThan(0)
  expect(errors.pageErrors).toEqual([])
})

test('the rich text of a hostile shape renders as text, not as its markup', async ({ page, diagram }) => {
  await diagram.open('hostile')
  await expect(page.locator(SURFACE).first()).toBeVisible()

  // The words survive sanitisation; the img that carried the payload does not.
  await expect(page.locator('.fd-richtext').first()).toContainText('rich')
  expect(await page.locator('.fd-richtext img').count(), 'the injected <img> survived').toBe(0)
  expect(await xssFired(page)).toBe(false)
})

test('a hostile document executes nothing in the home tile preview', async ({ page, diagram }) => {
  // The home grid lists diagrams SHARED with the user and public ones, so a tile
  // renders a document the viewer did not author without them opening anything.
  //
  // It has to be switched to TILE view first: the grid defaults to list rows, which
  // show the diagram-type icon and never call documentToSvg. Asserting on the
  // default view passes against vulnerable code — the injected markup is not in the
  // page at all — so this test would prove nothing without the toggle.
  const errors = watchForErrors(page)
  await diagram.create('hostile')

  await gotoHome(page)
  await buttonByIcon(page, 'grid').click()
  const preview = page.locator('[class*="[&>svg]"] svg').first()
  await expect(preview, 'no tile preview rendered, so nothing was exercised').toBeVisible()

  expect(await xssFired(page), 'a payload executed while previewing a tile').toBe(false)
  expect(errors.pageErrors).toEqual([])
})
