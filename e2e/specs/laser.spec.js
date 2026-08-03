import { test, expect } from '../helpers/fixtures.js'
import { surfaceBox } from '../helpers/editor.js'

// The laser pointer (#41): a presentation aid that follows the moving pointer as a
// single dot, fades itself out on its own, and never writes anything to the document.
// The trail was dropped in #102 — it is just the dot now — so the dot is asserted from
// the DOM (it is transient by design and therefore invisible to the persisted-document
// assertions used everywhere else) via a data-testid rather than its fill colour, and
// the "never persists" half is asserted from the saved document.

const LASER_DOT = '[data-testid="laser-dot"]'

// Sweep the pointer without pressing: the laser follows hover, like a real one.
async function sweep(page, steps = 12) {
  const box = await surfaceBox(page)
  const y = box.y + box.height / 2
  for (let i = 0; i <= steps; i += 1) {
    await page.mouse.move(box.x + 200 + (i * 300) / steps, y)
  }
}

test.describe('laser pointer', () => {
  test('shows a dot under the moving pointer, then clears itself', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { empty: true })
    await page.getByTestId('wtool-laser').click()

    // Sweep and read inside ONE poll: the dot is alive for well under a second, so a
    // sweep followed by a separate read races its own fade. The dot appearing under
    // the moving pointer is the whole behaviour now that the trail is gone (#102).
    await expect.poll(async () => {
      await sweep(page)
      return page.locator(LASER_DOT).count()
    }, { message: 'the laser drew no dot under the moving pointer' }).toBeGreaterThan(0)

    // With the pointer still, the dot fades out entirely (self-fading, spec C5).
    await expect.poll(() => page.locator(LASER_DOT).count(), {
      message: 'the laser dot never faded away after the pointer stopped',
      timeout: 5_000,
    }).toBe(0)
  })

  test('draws nothing into the document', async ({ page, diagram }) => {
    const name = await diagram.open('whiteboard', { empty: true })
    await page.getByTestId('wtool-laser').click()

    // Press and drag too: a laser gesture must stay transient even when it looks
    // exactly like a pen stroke.
    const box = await surfaceBox(page)
    await page.mouse.move(box.x + 200, box.y + 200)
    await page.mouse.down()
    await sweep(page)
    await page.mouse.up()

    const saved = await diagram.saved(name)
    expect(saved.whiteboard.strokes).toHaveLength(0)
    expect(saved.whiteboard.lines || []).toHaveLength(0)
  })
})
