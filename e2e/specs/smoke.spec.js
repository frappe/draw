import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { SURFACE, minimap } from '../helpers/editor.js'

// Every diagram type must open, render its seeded content, and raise no errors.
// This is the cheapest guard against a type being broken outright by a change aimed
// at another one — which is how the unified canvas regressed in the first place.
const TYPES = ['block', 'mindmap', 'flowchart', 'whiteboard', 'unified']

for (const type of TYPES) {
  test(`${type}: opens and renders seeded content cleanly`, async ({ page, diagram }) => {
    const errors = watchForErrors(page)

    await diagram.open(type)

    await expect(page.locator(SURFACE).first()).toBeVisible()
    // Every type paints seeded content as SVG rects and/or paths inside the surface: a
    // legacy single-type mind map draws node boxes + branch paths, and on the unified
    // canvas a migrated node is an ordinary rect/glyph shape with connector paths (#122)
    // — no `.fd-mm-label` special-case any more.
    const drawn = await page.locator(`${SURFACE} rect, ${SURFACE} path`).count()
    expect(drawn, `${type} rendered nothing from its seeded document`).toBeGreaterThan(0)

    expect(errors.pageErrors, `${type} raised uncaught exceptions`).toEqual([])
    expect(errors.failures, `${type} made requests that failed`).toEqual([])
  })

  test(`${type}: shows a minimap once the document has content`, async ({ page, diagram }) => {
    // With an empty document the navigator renders a placeholder instead of an svg,
    // so this only holds for a seeded one.
    await diagram.open(type)
    await expect(minimap(page), `${type} has no minimap svg`).toBeVisible()
  })
}
