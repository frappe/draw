// Editor-driving helpers. Every non-obvious technique here exists because the
// straightforward approach silently fails against this canvas — the comments say
// which, so nobody "simplifies" them back into flakiness.

import { expect } from '@playwright/test'
import ICON_NODES from '../../frontend/src/icons/lucideNodes.js'
import { LUCIDE_ALIAS } from '../../frontend/src/icons/lucideAlias.js'

export const SURFACE = '[data-fdpreset]'
export const MINIMAP = '[aria-label="Minimap"], [aria-label="Navigator"]'
export const MM_TOOLBAR = '[data-mm-toolbar]'
export const PALETTE = '[data-palette]'
export const TOOL_PAYLOAD_KEY = 'application/x-frappe-draw-tool'

export async function openDiagram(page, name) {
  await page.goto(`/draw/d/${name}`)
  await page.waitForLoadState('networkidle')
  // The canvas surface is the first thing the editor mounts; wait on it rather
  // than a fixed sleep.
  await page.locator(SURFACE).first().waitFor({ state: 'visible' })
  await expect(page.locator(SURFACE).first()).toBeVisible()
}

export function surface(page) {
  return page.locator(SURFACE).first()
}

export async function surfaceBox(page) {
  const box = await surface(page).boundingBox()
  if (!box) throw new Error('canvas surface has no box — did the editor mount?')
  return box
}

// The canvas root <g> carries translate(panX panY) scale(zoom); reading it is the
// cheapest way to assert that a pan or zoom actually happened.
export async function canvasTransform(page) {
  return page.evaluate(() => {
    const g = document.querySelector('svg g[transform^="translate"]')
    return g ? g.getAttribute('transform') : null
  })
}

// --- finding icon-only buttons ----------------------------------------------
//
// Toolbar buttons render a lucide <svg> and nothing else: no label, no name, no
// data attribute. frappe-ui's Tooltip does NOT render under Playwright's
// synthetic hover, so tooltip text is not a usable hook either.
//
// Instead, build a selector from the glyph's own geometry, read out of the app's
// icon table — so it stays correct if an icon's path data is ever updated.
export function iconSelector(name) {
  const resolved = LUCIDE_ALIAS[name] || name
  const nodes = ICON_NODES[resolved]
  if (!nodes) throw new Error(`unknown lucide icon "${name}" — check lucideNodes.js`)
  // Chain :has() over a few child nodes: one <circle r="10"> is shared by several
  // glyphs, but a circle AND that glyph's specific lines are not.
  const parts = nodes.slice(0, 3).map(([tag, attrs]) => {
    const attrSel = Object.entries(attrs)
      .filter(([k]) => k !== 'key')
      .map(([k, v]) => `[${k}="${String(v).replace(/"/g, '\\"')}"]`)
      .join('')
    return `:has(svg ${tag}${attrSel})`
  })
  return `button${parts.join('')}`
}

export function buttonByIcon(page, name, scope) {
  return (scope || page).locator(iconSelector(name)).first()
}

// A tool button in the bottom palette. ALWAYS scope tool lookups: several glyphs
// appear more than once in the editor (the pencil is both the whiteboard Pen and
// the title's rename button in the header), and an unscoped .first() silently
// clicks the wrong one — the drag that follows then does nothing and the failure
// looks like a broken tool.
export function toolByIcon(page, name) {
  return page.locator(PALETTE).locator(iconSelector(name)).first()
}

// --- mind map ---------------------------------------------------------------

// A transparent hit-rect sits over each node label and intercepts pointer events
// (it IS the node's click target), so Locator.click() is refused as "element
// intercepts pointer events". Dispatch a real mouse click at the label's centre.
export async function clickNode(page, label) {
  const el = page.locator('.fd-mm-label', { hasText: label }).first()
  const box = await el.boundingBox()
  if (!box) throw new Error(`mind-map node "${label}" not found`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

export function crosslinks(page) {
  return page.locator('line[stroke-dasharray="2 5"]')
}

export function selectedCrosslinks(page) {
  return page.locator('line[stroke="#006EDB"][stroke-dasharray="2 5"]')
}

// --- palette ---------------------------------------------------------------

export async function openShapesPopover(page) {
  await buttonByIcon(page, 'shapes').click()
  const tiles = page.locator('[draggable="true"]')
  await tiles.first().waitFor({ state: 'visible' })
  return tiles
}

// Drag a palette tile onto the canvas.
//
// Playwright's synthetic mouse does NOT reliably start a native HTML5 drag — a
// mouse-based attempt hangs indefinitely. Dispatch the drag events directly with
// ONE shared DataTransfer, which is precisely the contract under test: the tile's
// dragstart writes the tool type, the canvas drop handler reads it back.
export async function dragTileToCanvas(page, { tileIndex = 0, x, y } = {}) {
  return page.evaluate(
    async ([index, dropX, dropY, payloadKey]) => {
      const tile = document.querySelectorAll('[draggable="true"]')[index]
      const el = document.querySelector('[data-fdpreset]')
      if (!tile || !el) throw new Error('tile or canvas surface missing')
      const dt = new DataTransfer()
      tile.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }),
      )
      const payload = dt.getData(payloadKey)
      const r = el.getBoundingClientRect()
      const opts = {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: r.left + dropX,
        clientY: r.top + dropY,
      }
      el.dispatchEvent(new DragEvent('dragover', opts))
      el.dispatchEvent(new DragEvent('drop', opts))
      return { payload, types: [...dt.types] }
    },
    [tileIndex, x ?? 520, y ?? 330, TOOL_PAYLOAD_KEY],
  )
}

// --- drawing on the surface -------------------------------------------------

// Press-drag across the canvas in logical screen coords relative to the surface.
export async function dragOnCanvas(page, from, to, steps = 10) {
  const box = await surfaceBox(page)
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps })
  await page.mouse.up()
}

export async function clickCanvas(page, x, y) {
  const box = await surfaceBox(page)
  await page.mouse.click(box.x + x, box.y + y)
}

// Click empty canvas to deselect. Deliberately near the TOP-left: the bottom-left
// corner holds the zoom controls, so clicking there never reaches the canvas.
export async function clickEmptyCanvas(page) {
  await clickCanvas(page, 70, 70)
}

// --- minimap ----------------------------------------------------------------

export function minimap(page) {
  return page.locator(`${MINIMAP} svg`).first()
}

export async function clickMinimap(page, dx, dy) {
  const box = await minimap(page).boundingBox()
  if (!box) throw new Error('minimap not rendered — does the document have content?')
  await page.mouse.click(box.x + dx, box.y + dy)
}

// --- unified-canvas frames ---------------------------------------------------

// The focus-mode indicator: EditorShell renders one button reading
// "Back to canvas · editing <frame>" while editorUi.state.focusedFrame is set.
//
// Match the BUTTON, never getByText(/editing/i). The `diagram` fixture names each
// document after the test that created it, so that pattern happily matched the test
// title in the editor header — an assertion that passed whatever the app did.
export function backToCanvas(page) {
  return page.getByRole('button', { name: /back to canvas/i })
}

// Enter in-frame editing by double-clicking a node inside a frame, and wait for the
// indicator so later keystrokes are not delivered mid-transition.
//
// Throws if the node is outside the window: frames are seeded at their own origin and
// a document whose frame sits below the fold silently swallows every interaction —
// page.mouse ignores out-of-window coordinates. Use the `framesInView` fixture.
export async function enterFrame(page, label) {
  const target = page.locator('.fd-mm-label', { hasText: label }).first()
  const box = await target.boundingBox()
  if (!box) throw new Error(`node "${label}" is not rendered`)
  const { width, height } = page.viewportSize()
  if (box.y + box.height > height || box.x + box.width > width) {
    throw new Error(
      `node "${label}" is outside the ${width}x${height} window (at ${Math.round(box.x)},` +
        `${Math.round(box.y)}) — seed the frames in view rather than clicking into the void`,
    )
  }
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect(backToCanvas(page)).toBeVisible({ timeout: 10_000 })
}
