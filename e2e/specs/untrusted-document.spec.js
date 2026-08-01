import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { SURFACE, buttonByIcon } from '../helpers/editor.js'
import { gotoHome } from '../helpers/api.js'

// A diagram document is UNTRUSTED input. `save_diagram` persists whatever JSON a
// client posts and `parseDiagramDocument` coerces nothing, and diagrams get shared
// with other users and made public — so a document reaches a second person's browser
// exactly as its author wrote it. Two paths take it into the DOM as markup:
//
//   - ShapeView v-html's the rich text (`shape.text.html`) into a foreignObject.
//   - useThumbnail builds SVG by string concatenation, and TrashView v-html's that
//     into the trash grid. (The home grid now renders the stored raster thumbnail
//     instead of the document SVG — #20 — so that tile vector is gone.)
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

test('the home tile preview cannot execute a hostile document', async ({ page, diagram }) => {
  // The home grid lists diagrams SHARED with the user and public ones, so a tile
  // shows a document the viewer did not author without them opening anything.
  //
  // The tile no longer rebuilds an SVG from that untrusted document — it renders the
  // stored raster thumbnail, or the type icon when there is none yet (#20). So the
  // documentToSvg-into-a-tile vector is removed by construction: the document's
  // fields never reach the tile DOM as markup. This pins that it stays removed.
  const errors = watchForErrors(page)
  await diagram.create('hostile')

  await gotoHome(page)
  await buttonByIcon(page, 'grid').click()

  // The hostile diagram's tile rendered in grid view (so the path was exercised)…
  await expect(page.locator('div[class*="120px"]').first()).toBeVisible()
  // …with NO injected document-SVG preview container anywhere on the page.
  expect(
    await page.locator('[class*="[&>svg]"] svg').count(),
    'the injected document-SVG tile preview must be gone',
  ).toBe(0)
  expect(await xssFired(page), 'a payload executed while previewing a tile').toBe(false)
  expect(errors.pageErrors).toEqual([])
})
