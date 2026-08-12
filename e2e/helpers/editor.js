// Editor-driving helpers. Every non-obvious technique here exists because the
// straightforward approach silently fails against this canvas — the comments say
// which, so nobody "simplifies" them back into flakiness.

import { expect } from '@playwright/test'
import { LUCIDE_ALIAS } from '../../frontend/src/icons/lucideAlias.js'

export const SURFACE = '[data-fdpreset]'
export const MINIMAP = '[aria-label="Minimap"], [aria-label="Navigator"]'
// The static canvas toolbar (#359). Every selection's controls live here now,
// so this replaced the per-type floating bars. It is ALWAYS present, so asserting
// it is visible proves nothing — assert on a control only that selection puts in
// it, the way the mind-map specs do with the cross-link and focus buttons.
export const TOOLBAR = '[data-canvas-toolbar]'
// frappe-ui portals a Popover's body out of its trigger's subtree, so popover
// content is NOT inside [data-palette]. Scope lookups to the portalled panel.
export const POPOVER = '[data-slot="content"]'
export const TOOL_PAYLOAD_KEY = 'application/x-frappe-draw-tool'
// The in-shape text editor's foreignObject, mounted only while a session is live.
export const TEXT_EDITOR = '[data-text-editor]'

// Leave in-shape text editing and WAIT for the session to actually end.
//
// Escape does not commit by itself — it calls the Tiptap editor's blur(), and the
// commit plus the teardown of the session ride on the blur that follows. A key
// sent straight after Escape can therefore arrive while the editor still owns the
// keyboard, and is swallowed instead of reaching the canvas handler. A person
// typing has tens of milliseconds between keystrokes and never sees it; Playwright
// sends the next key in under one, which is why this only ever failed on a loaded
// CI runner (#415's E2E run, green on the retry).
export async function exitTextEdit(page) {
  await page.keyboard.press('Escape')
  await expect(page.locator(TEXT_EDITOR)).toBeHidden()
}

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
// Toolbar buttons render an icon and nothing else: no label, no name, no data
// attribute. frappe-ui's Tooltip does NOT render under Playwright's synthetic
// hover, so tooltip text is not a usable hook either.
//
// Every icon in the app is now a lucide CSS class (#311) — either on a <span>
// the button contains, or on the button itself when frappe-ui renders an
// `icon="lucide-*"` prop. Legacy feather names in specs still resolve through
// LUCIDE_ALIAS, so `toolByIcon(page, 'edit')` keeps finding a `lucide-square-pen`.
export function iconSelector(name) {
  const resolved = LUCIDE_ALIAS[name] || name
  return `button:has(.lucide-${resolved}), button.lucide-${resolved}`
}

export function buttonByIcon(page, name, scope) {
  return (scope || page).locator(iconSelector(name)).first()
}

// A tool button on the canvas toolbar. ALWAYS scope tool lookups: several glyphs
// appear more than once in the editor (the pencil is both the whiteboard Pen and
// the title's rename button in the header), and an unscoped .first() silently
// clicks the wrong one — the drag that follows then does nothing and the failure
// looks like a broken tool.
export function toolByIcon(page, name) {
  return page.locator(TOOLBAR).locator(iconSelector(name)).first()
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

// --- the insert menus (#364) --------------------------------------------------
//
// The single circular "+" catalog is gone. Its five sections became toolbar
// entries, and the tiles inside each carry real accessible names now
// (ToolbarButton requires a label), so these no longer have to reach a tile
// through its section header.
//
// Three of those entries still open a menu — Shapes, Lines and Flowchart, each
// holding a grid of types. Mind map is a plain button, and Text / Sticky note /
// Image / Table are plain buttons too since the "Insert" dropdown was retired.
export async function openInsertMenu(page, label) {
  await page.locator(TOOLBAR).getByRole('button', { name: label, exact: true }).click()
  const menu = page.locator(POPOVER)
  await menu.waitFor({ state: 'visible' })
  return menu
}

// Insert a free-floating mind-map node: a SINGLE role-tagged root SHAPE lands on
// shapes[] (#122), not a framed sub-model. Mind map is one toolbar button rather
// than a menu, since its section only ever held the one tile. It ARMS a placement
// pointer (#75 click-to-place), so click the canvas to drop the root.
export async function insertMindmapNode(page) {
  const entry = page.locator(TOOLBAR).getByRole('button', { name: 'Mind map', exact: true })
  await entry.click()
  // Wait for the armed state before clicking the canvas. The old helper got this
  // synchronisation for free by awaiting the catalog popover's disappearance;
  // a plain toolbar button has no such step, and clicking the canvas before the
  // starter is armed drops nothing at all.
  await expect(entry).toHaveAttribute('aria-pressed', 'true')
  const box = await surfaceBox(page)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// Insert a free-floating flowchart node: a SINGLE role-tagged SHAPE of the first
// node type (the Terminator, the default starter). Arms click-to-place too.
export async function insertFlowchartNode(page) {
  const menu = await openInsertMenu(page, 'Flowchart')
  await menu.locator('button').first().click()
  await expect(menu).toBeHidden()
  const box = await surfaceBox(page)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// Arm a block shape's draw tool: click a Shapes tile (the first, the rectangle,
// by default) to enter press-drag-to-draw. A click arms the tool and closes the
// menu, so awaiting its hidden state also proves the click landed.
export async function armShapeFromCatalog(page, index = 0) {
  const menu = await openInsertMenu(page, 'Shapes')
  await menu.locator('button').nth(index).click()
  await expect(menu).toBeHidden()
}

// Arm the Polygon tool (#139). Polygon is the one shape that cannot be dragged,
// which makes it the menu's only non-draggable tile — a stabler hook than a grid
// index. Clicking arms the multi-click draw tool; place vertices with clickCanvas
// and finish with Enter.
export async function armPolygonFromCatalog(page) {
  const menu = await openInsertMenu(page, 'Shapes')
  await menu.locator('button[draggable="false"]').first().click()
  await expect(menu).toBeHidden()
}

// Arm a pointing mode: 'select', 'hand' or 'laser'. All three live behind ONE
// toolbar entry, so the entry opens first. Its own label and icon follow the
// active mode, which is why it is addressed by test id rather than by name.
export async function armPointerMode(page, tool) {
  await page.getByTestId('pointer-modes').click()
  await page.getByTestId(`wtool-${tool}`).click()
  await expect(page.locator(POPOVER)).toBeHidden()
}

// Arm a create tool by its lucide glyph. Every one of them is a button ON the
// bar: the live annotation tools (Draw, Eraser, Laser) always were, and Text /
// Sticky note / Image / Table came out of the "Insert" dropdown that used to
// hold them.
export async function armCreateToolFromCatalog(page, icon) {
  await toolByIcon(page, icon).click()
}

// Place a table from the toolbar's size picker (#134): the Table entry opens a
// hover grid, and clicking the "rows × cols" cell commits that exact size. The
// picker's grid is the only role="grid" on the page and each cell's accessible
// name is its size, so the target is addressed directly rather than by a sweep.
//
// toolByIcon takes the FIRST lucide-table on the bar, which is this entry:
// the whiteboard object group's table glyph only appears further along, after
// the fixed prefix, and only while a table is selected.
export async function insertTableFromCatalog(page, rows, cols) {
  await toolByIcon(page, 'table').click()
  const grid = page.getByRole('grid')
  await grid.waitFor({ state: 'visible' })
  await grid.getByRole('button', { name: `${rows} × ${cols}`, exact: true }).click()
  await expect(page.locator(POPOVER)).toBeHidden()
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
      // Fire dragend on the source tile too, exactly as a real drag does: its handler
      // closes the "+" catalog. Without it the popover lingers over the canvas and the
      // next step (an Arrange menu, a selecting click) lands on the panel instead.
      tile.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }),
      )
      return { payload, types: [...dt.types] }
    },
    [tileIndex, x ?? 520, y ?? 330, TOOL_PAYLOAD_KEY],
  )
}

// Open the Shapes menu and DRAG its first tile (the rectangle) onto the canvas at
// (x, y). Wait for the tiles to render before dispatching the drag;
// dragTileToCanvas fires dragend, which closes the menu, so the drop leaves a bare
// canvas for whatever the test does next. Returns the payload.
export async function dragShapeFromCatalog(page, { x, y } = {}) {
  const menu = await openInsertMenu(page, 'Shapes')
  await menu.locator('[draggable="true"]').first().waitFor({ state: 'visible' })
  const result = await dragTileToCanvas(page, { x, y })
  await expect(menu).toBeHidden()
  return result
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
