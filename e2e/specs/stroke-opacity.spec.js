import { test, expect } from '../helpers/fixtures.js'
import { surfaceBox } from '../helpers/editor.js'

// Ink opacity used to be a live editor preference rather than stroke data (#409),
// which had three visible consequences: the export, the thumbnail and the minimap
// painted their own idea of it, moving the slider restyled ink already on the
// board, and nothing survived a reload. Opacity is stored on the stroke now, so a
// stroke is drawn once and looks the same everywhere, forever.
//
// The canvas is the only surface this spec can read (export and thumbnail are
// asserted in the documentToSvg unit tests, which cover the same helper), but it
// is the surface that proves the capture path: what the tool was set to at
// pointer-down is what the committed stroke carries.

const SURFACE_ROOT = '[role="application"]'
const DEFAULT_INK = '#171717'
const committedStrokes = (page) => page.locator(`${SURFACE_ROOT} path[stroke="${DEFAULT_INK}"]`)

// One freehand stroke at the given fraction of the surface height. Several moves,
// spaced well past the sampler's minimum distance, so the gesture commits.
async function drawStroke(page, heightFraction) {
  const box = await surfaceBox(page)
  const y = box.y + box.height * heightFraction
  await page.mouse.move(box.x + 150, y)
  await page.mouse.down()
  for (let i = 1; i <= 5; i += 1) await page.mouse.move(box.x + 150 + i * 60, y)
  await page.mouse.up()
}

// Arm the pen (the click also opens its options) and drive the Opacity slider with
// the keyboard — the thumb is a reka-ui `role="slider"`, so Home/End reach the ends
// of the range without depending on where the track happens to be laid out.
async function setPenOpacity(page, edge) {
  await page.getByTestId('wtool-pen').click()
  const thumb = page.getByRole('slider')
  await expect(thumb).toBeVisible()
  await thumb.focus()
  await page.keyboard.press(edge)
}

test.describe('stroke opacity', () => {
  test('each stroke keeps the opacity it was drawn at, whatever the slider does after', async ({
    page,
    diagram,
  }) => {
    await diagram.open('whiteboard', { empty: true })

    await setPenOpacity(page, 'Home')
    await drawStroke(page, 0.35)
    await expect(committedStrokes(page)).toHaveCount(1)
    const faint = await committedStrokes(page).first().getAttribute('stroke-opacity')
    expect(Number(faint), 'the pen ignored the opacity it was set to').toBeLessThan(1)

    // Turning the slider back up must apply to the NEXT stroke only. Before this
    // fix both strokes would now be reading the same live value.
    await setPenOpacity(page, 'End')
    await drawStroke(page, 0.65)
    await expect(committedStrokes(page)).toHaveCount(2)

    const [first, second] = await committedStrokes(page).evaluateAll((paths) =>
      paths.map((path) => Number(path.getAttribute('stroke-opacity'))),
    )
    expect(first, 'raising the slider restyled a stroke that was already drawn').toBe(Number(faint))
    expect(second, 'the second stroke did not pick up the new slider value').toBeGreaterThan(first)
  })

  test('the opacity reaches the saved document, so it survives a reload', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })

    await setPenOpacity(page, 'Home')
    await drawStroke(page, 0.5)
    await expect(committedStrokes(page)).toHaveCount(1)
    const drawn = Number(await committedStrokes(page).first().getAttribute('stroke-opacity'))
    expect(drawn).toBeLessThan(1)

    // The preference itself was never persisted, so a stroke that carries no
    // opacity of its own reopens at the ink default however it was drawn.
    await expect
      .poll(async () => (await diagram.saved(name)).whiteboard.strokes[0]?.opacity, {
        message: 'the saved stroke does not carry the opacity it was drawn at',
        timeout: 20_000,
      })
      .toBe(drawn)
  })
})
