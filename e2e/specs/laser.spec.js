import { test, expect } from '../helpers/fixtures.js'
import { surfaceBox } from '../helpers/editor.js'

// The laser pointer (#41, #102, #253): a presentation aid. Armed but not pressed,
// it is a single fading dot under the pointer and hides the OS cursor so nothing
// but the dot reads as "pointer". Pressed and dragged, it also leaves a short
// fading trail (like a real laser pointer). Neither ever writes to the document.
// The dot/trail are transient by design and invisible to the persisted-document
// assertions used everywhere else, so they're asserted from the DOM instead.

const LASER_DOT = '[data-testid="laser-dot"]'
const SURFACE_ROOT = '[role="application"]'
const TRAIL = `${SURFACE_ROOT} path[stroke="#E03636"]`

async function sweep(page, steps = 12) {
  const box = await surfaceBox(page)
  const y = box.y + box.height / 2
  for (let i = 0; i <= steps; i += 1) {
    await page.mouse.move(box.x + 200 + (i * 300) / steps, y)
  }
}

test.describe('laser pointer', () => {
  test('hovering (no press) shows only the dot, no trail, and hides the cursor', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { empty: true })
    await page.getByTestId('wtool-laser').click()

    await expect(page.locator(SURFACE_ROOT)).toHaveCSS('cursor', 'none')

    // Sweep and read inside ONE poll: the dot is alive for well under a second, so a
    // sweep followed by a separate read races its own fade.
    await expect.poll(async () => {
      await sweep(page)
      return page.locator(LASER_DOT).count()
    }, { message: 'the laser drew no dot under the moving pointer' }).toBeGreaterThan(0)

    // Hovering must never accumulate a trail behind the dot (#253).
    expect(await page.locator(TRAIL).count()).toBe(0)

    // With the pointer still, the dot fades out entirely (self-fading, spec C5).
    await expect.poll(() => page.locator(LASER_DOT).count(), {
      message: 'the laser dot never faded away after the pointer stopped',
      timeout: 5_000,
    }).toBe(0)
  })

  test('pressing and dragging leaves a fading trail, then clears itself', async ({ page, diagram }) => {
    await diagram.open('whiteboard', { empty: true })
    await page.getByTestId('wtool-laser').click()

    const box = await surfaceBox(page)
    await page.mouse.move(box.x + 200, box.y + box.height / 2)
    await page.mouse.down()

    // Sweep and read inside ONE poll, same reasoning as the hover case. More than
    // one segment IS the trail, and the oldest segment being fainter than the
    // newest is the fade.
    await expect.poll(async () => {
      await sweep(page)
      const opacities = await page.locator(TRAIL).evaluateAll((nodes) =>
        nodes.map((node) => Number(node.getAttribute('stroke-opacity'))),
      )
      return opacities.length > 1 && opacities[0] < opacities[opacities.length - 1]
    }, { message: 'dragging the laser left no fading trail behind the pointer' }).toBe(true)

    await page.mouse.up()

    // Once released, the trail fades out entirely (self-fading, spec C5).
    await expect.poll(() => page.locator(TRAIL).count(), {
      message: 'the laser trail never faded away after the pointer was released',
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
