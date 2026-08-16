import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { TOOLBAR, POPOVER, openInsertMenu, dragOnCanvas } from '../helpers/editor.js'

// The connector's edit menu had NO end-to-end coverage, which is how it could be
// rebuilt (#490/#492/#493/#494) with nothing to catch a menu that renders empty or
// a control that no longer writes through. Every assertion reads the PERSISTED
// document, because a control that updates the canvas but never reaches connectors[]
// is this app's characteristic failure.
//
// It also exercises the one path a unit test cannot: the menu opens inside a
// Popover, whose content is teleported out of the toolbar — which is where the
// tooltip provider, the swatch grid and the drawn glyphs all have to work anyway.

const connectors = (doc) => doc.connectors || []

// Draw an arrow across empty canvas and leave it selected.
async function drawConnector(page) {
  const menu = await openInsertMenu(page, 'Lines')
  // The tiles say both axes since #499 — "Arrow" alone no longer names one.
  await menu.getByRole('button', { name: 'Straight arrow', exact: true }).click()
  await dragOnCanvas(page, { x: 180, y: 180 }, { x: 420, y: 300 })
}

// The connector's own edit menu on the toolbar, which only appears with one selected.
async function openLineMenu(page) {
  await page.locator(TOOLBAR).getByRole('button', { name: 'Line', exact: true }).click()
  const menu = page.locator(POPOVER)
  await menu.waitFor({ state: 'visible' })
  return menu
}

test.describe('the connector edit menu', () => {
  test('opens on a drawn connector and writes a dash through to the document', async ({
    page,
    diagram,
  }) => {
    const errors = watchForErrors(page)
    const name = await diagram.open('unified', { empty: true })

    await drawConnector(page)
    await expect
      .poll(async () => connectors(await diagram.saved(name)).length, {
        message: 'drawing an arrow saved no connector',
        timeout: 20_000,
      })
      .toBe(1)

    const menu = await openLineMenu(page)
    // Every row is icon cells now (#493), so each is addressed by its accessible
    // name rather than by visible text — there is none.
    await menu.getByRole('button', { name: 'Dash: Dashed' }).click()

    await expect
      .poll(async () => connectors(await diagram.saved(name))[0]?.style?.dash, {
        message: 'the dash cell did not reach the saved connector',
        timeout: 20_000,
      })
      .toBe('dashed')

    expect(errors.pageErrors, 'the connector menu raised uncaught exceptions').toEqual([])
  })

  test('shows no label field — a label is added by double-clicking (#492)', async ({
    page,
    diagram,
  }) => {
    await diagram.open('unified', { empty: true })
    await drawConnector(page)
    const menu = await openLineMenu(page)

    await expect(menu.getByPlaceholder('Add label…')).toHaveCount(0)
    // The rows that remain are still there, so this is a removal rather than a
    // menu that failed to render.
    await expect(menu.getByRole('button', { name: 'Start: Arrow' })).toBeVisible()
  })

  test('offers Espresso swatches for the line colour, not a hex field (#494)', async ({
    page,
    diagram,
  }) => {
    const name = await diagram.open('unified', { empty: true })
    await drawConnector(page)
    const menu = await openLineMenu(page)

    // No text input at all in the menu: the hex field was the only one left.
    await expect(menu.locator('input[type="text"]')).toHaveCount(0)

    // A swatch writes the colour through. The grid names each one "<family> <level>".
    await menu.getByRole('button', { name: 'blue 500', exact: true }).click()
    await expect
      .poll(async () => connectors(await diagram.saved(name))[0]?.style?.color, {
        message: 'picking a swatch did not reach the saved connector',
        timeout: 20_000,
      })
      .toBe('#0289F7')
  })
})

// #499: the menu is a matrix now — a line and an arrow for each of straight,
// elbowed and curved. Two of the six are genuinely NEW (an elbowed line and a
// curved line had no tool at all), so these draw each one and read what reached the
// document: the geometry and whether it ended in a head.
test.describe('the six connector tools (#499)', () => {
  const drawn = async (diagram, name) => (await diagram.saved(name)).connectors[0]

  for (const [tile, type, head] of [
    ['Straight line', 'straight', 'none'],
    ['Elbowed line', 'elbow', 'none'],
    ['Curved line', 'curved', 'none'],
    ['Straight arrow', 'straight', 'arrow'],
    ['Elbowed arrow', 'elbow', 'arrow'],
    ['Curved arrow', 'curved', 'arrow'],
  ]) {
    test(`${tile} draws a ${type} ending in ${head}`, async ({ page, diagram }) => {
      const name = await diagram.open('unified', { empty: true })

      const menu = await openInsertMenu(page, 'Lines')
      await menu.getByRole('button', { name: tile, exact: true }).click()
      await dragOnCanvas(page, { x: 180, y: 180 }, { x: 420, y: 300 })

      await expect
        .poll(async () => (await diagram.saved(name)).connectors?.length, {
          message: `${tile} saved no connector`,
          timeout: 20_000,
        })
        .toBe(1)

      const connector = await drawn(diagram, name)
      expect(connector.type, `${tile} drew the wrong geometry`).toBe(type)
      expect(connector.arrowheads.end, `${tile} drew the wrong ending`).toBe(head)
      expect(connector.arrowheads.start, 'no tool starts with a head').toBe('none')
    })
  }
})
