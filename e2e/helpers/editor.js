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
// frappe-ui portals a Popover's body out of its trigger's subtree, so popover
// content is NOT inside [data-palette]. Scope lookups to the portalled panel.
export const POPOVER = '[data-slot="content"]'
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
  const box = await boxInWindow(page, el, `mind-map node "${label}"`)
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

// --- the "+" Add catalog (free-floating #122 / catalog #90) -------------------
//
// The mind-map and flowchart tiles moved out of the old Shapes popover into the one
// circular "+" catalog (#90) that the create canvas centres on the bottom bar. It is
// the button labelled "Add"; its tiles sit under plain-text section headers ("Shapes",
// "Lines & connectors", "Draw & insert", "Mind map", "Flowchart"). Opening it returns
// the portalled panel (a Popover, so NOT under [data-palette] — scope to POPOVER).
export async function openAddCatalog(page) {
  await page.locator(PALETTE).locator('[aria-label="Add"]').click()
  return page.locator(POPOVER)
}

// The tile(s) under one catalog section, reached from the section header rather than
// the tile: a catalog tile is icon-only (a drawn ShapeGlyph, no accessible name) and
// frappe-ui Tooltip text is not a hook under Playwright (see iconSelector). The tile
// grid is the header's immediate next sibling, so this never catches a block/line tile.
function catalogSectionTiles(catalog, sectionLabel) {
  return catalog
    .getByText(sectionLabel, { exact: true })
    .locator('xpath=following-sibling::div[1]')
    .locator('button')
}

// Insert a free-floating mind-map node from the catalog: a SINGLE role-tagged root
// SHAPE lands on shapes[] (#122), not a framed sub-model. The click closes the
// popover, so awaiting its hidden state also proves the click was delivered.
export async function insertMindmapNode(page) {
  const catalog = await openAddCatalog(page)
  const tile = catalogSectionTiles(catalog, 'Mind map').first()
  await tile.waitFor({ state: 'visible' })
  await tile.click()
  await expect(catalog).toBeHidden()
}

// Insert a free-floating flowchart node from the catalog: a SINGLE role-tagged SHAPE
// of the first node type (the Terminator, the default starter) lands on shapes[].
export async function insertFlowchartNode(page) {
  const catalog = await openAddCatalog(page)
  const tile = catalogSectionTiles(catalog, 'Flowchart').first()
  await tile.waitFor({ state: 'visible' })
  await tile.click()
  await expect(catalog).toBeHidden()
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

// --- unified-canvas mind-map / flowchart objects ------------------------------

// A mind map or flowchart on the unified canvas is an ordinary canvas object whose
// content is live: nodes are clicked, dragged and edited IN PLACE (#45). There is no
// focus mode to enter and no "Back to canvas" breadcrumb — an earlier design had
// both, and entering a frame re-framed the camera, which is the jump #45 removed.

// An element's on-screen box, failing loudly when it lies outside the window.
//
// page.mouse silently IGNORES out-of-window coordinates, so content seeded below the
// fold swallows every interaction and the test still passes. That defect shipped once
// already: the suite ran at a different viewport than configured and the seeded
// mind map sat under the fold. Seed with the `framesInView` fixture.
export async function boxInWindow(page, locator, what) {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${what} is not rendered`)
  const { width, height } = page.viewportSize()
  const outside = box.x < 0 || box.y < 0 || box.x + box.width > width || box.y + box.height > height
  if (outside) {
    throw new Error(
      `${what} is outside the ${width}x${height} window (at ${Math.round(box.x)},` +
        `${Math.round(box.y)}) — seed the content in view rather than interacting with the void`,
    )
  }
  return box
}

export function mindmapNode(page, label) {
  return page.locator('.fd-mm-label', { hasText: label }).first()
}

// A flowchart node has no .fd-mm-label; it is found by its text.
export function flowchartNode(page, label) {
  return page.getByText(label, { exact: true }).first()
}

// Drag a node by a delta, in place. Returns the box it started from.
export async function dragNode(page, locator, what, dx, dy) {
  const box = await boxInWindow(page, locator, what)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 12 })
  await page.mouse.up()
  return box
}

// --- free-floating (#122) mind-map / flowchart nodes on the unified canvas ------
//
// After the migration a mind-map / flowchart node is an ORDINARY shape rendered by
// ShapeView: a `<g data-shape-id>` group — a boxed root, a transparent-text child,
// or the exact flowchart glyph. The migration reuses each node's id verbatim as the
// shape id (m1…/f1…), so a seeded node is found by id; a node is also found by its
// label text. There is no `.fd-mm-label` and no frame hit-rect any more.
export function ffShape(page, id) {
  return page.locator(`[data-shape-id="${id}"]`).first()
}
export function ffNode(page, label) {
  return page.getByText(label, { exact: true }).first()
}

// Select a free-floating node by clicking the CENTRE of its rendered box. Selection
// is a geometric hit-test (topShapeAt), not a DOM click, and a transparent-text child
// has no fill to click, so a real mouse click at the box centre is what selects it.
export async function selectShape(page, locator, what) {
  const box = await boxInWindow(page, locator, what)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// The on-canvas "+" add-handles for migrated nodes (#118 mind map / #77 flowchart):
// a handle reveals for a hovered or sole-selected node (select tool only). Each is a
// filled circle carrying an "Add child"/"Add sibling"/"Add step" <title>.
export function mindmapAddHandles(page) {
  return page.locator('[data-mindmap-hover-handles] circle')
}
export function flowchartAddHandles(page) {
  return page.locator('[data-flowchart-hover-handles] circle')
}

// Rubber-band a marquee enclosing the given elements: the press starts just outside
// their combined top-left (empty canvas, so it starts a marquee rather than grabbing a
// shape) and releases just past the bottom-right, so every shape the box covers is
// selected. Coordinates are read from the live geometry so the box always encloses the
// nodes wherever they landed; each element must be in-window (page.mouse ignores
// out-of-window coordinates — see boxInWindow).
export async function marqueeOver(page, locators, what) {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const locator of locators) {
    const box = await boxInWindow(page, locator, what)
    left = Math.min(left, box.x)
    top = Math.min(top, box.y)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  await page.mouse.move(left - 24, top - 24)
  await page.mouse.down()
  await page.mouse.move(right + 24, bottom + 24, { steps: 14 })
  await page.mouse.up()
}
