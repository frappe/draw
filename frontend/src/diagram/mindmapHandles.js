// Pure geometry for the migrated mind-map "+" add-handles overlay (issue #118).
//
// Gap-insertion model (#265/#264): a node's outward side shows one "+" for every
// slot a new child could take — one above the topmost child, one below the bottom
// one, and one in each gap between adjacent children (N children → N+1 handles).
// Clicking a "+" inserts a child at that ordinal and re-flows the tree. A childless
// node shows a single "+" at its own mid-height ("add the first child, same level").
//
// MindmapHoverHandles.vue draws the on-canvas "+" affordance that lets mouse users
// grow a migrated mind map without the keyboard (Tab/Enter). vitest is headless
// (no @vue/test-utils), so the component stays a thin renderer and every decision
// that can go wrong — which side(s) get a "+", where each sits, when they show —
// lives here and is unit-tested.
//
// A migrated mind-map node is an ordinary shape (role 'mindmap-node') with absolute
// x/y/w/h, so — unlike MindMapNodeLayer.vue, which works in node-local coords under
// a per-node <g translate> — these handles are produced directly in ABSOLUTE logical
// canvas units and rendered straight into the viewport <g>. The constants and the
// side/placement rules mirror MindMapNodeLayer so the two read pixel-identically.

import { isMindmapShape } from './freeFloating.js'
import { mindmapModelFromShapes } from './freeFloatingGraph.js'
import { gapHandlePoints, ADD_R, ADD_HIT_R, ADD_OFFSET, GAP, HANDLE_INSET } from './mindmapHandleSlots.js'
// --- geometry constants ------------------------------------------------------
// The mark is small and quiet; the TARGET is large (#427 items 1 and 7). They are
// separate numbers on purpose — an affordance that competes with the branches for
// attention is not the same problem as one that is hard to hit, and the old single
// radius could only ever trade one against the other.
//
// The sizes the "+" placement itself reasons about live in mindmapHandleSlots and
// are re-exported here, so a caller still has one module to import from.
export { ADD_R, ADD_HIT_R, ADD_OFFSET, GAP, HANDLE_INSET }
export const GLYPH = 3.5 // half-length of the white "+" strokes inside a circle
// The hover region reaches this far past the branch edge, so sliding the pointer
// off the node onto a "+" keeps the handles alive. Derived from the HIT radius,
// not the drawn one, so the region always covers what is clickable.
export const HOVER_OUT = ADD_OFFSET + ADD_HIT_R + 12

function boxOf(shape) {
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
}

export function pointInBox(point, box) {
  return (
    !!box &&
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  )
}

// A reusable index of the migrated mind map: the reconstructed tree nodes keyed by
// id (for parent/root walks) and each node's absolute box (for placement). Built
// once per render from the shared shapes/connectors and threaded through the pure
// helpers below, so a whole overlay pass reconstructs the model only once.
export function buildContext(shapes, connectors = []) {
  const model = mindmapModelFromShapes(shapes, connectors)
  const byId = {}
  for (const node of model.nodes) byId[node.id] = node
  const boxes = {}
  for (const shape of shapes || []) {
    if (isMindmapShape(shape)) boxes[shape.id] = boxOf(shape)
  }
  return { byId, boxes }
}

// The box of the ROOT of the tree `nodeId` hangs from — a map can hold several
// trees (#48), so side is read against a node's OWN root, not the first one. The
// seen-set caps the walk so corrupt (cyclic) parent tags can never hang a render.
function rootBox(nodeId, ctx) {
  const seen = new Set()
  let node = ctx.byId[nodeId]
  while (node && node.parentId && !seen.has(node.id)) {
    seen.add(node.id)
    node = ctx.byId[node.parentId]
  }
  return node ? ctx.boxes[node.id] : null
}

function rootCenterX(nodeId, ctx) {
  const box = rootBox(nodeId, ctx)
  return box ? box.x + box.w / 2 : 0
}

function isRootNode(nodeId, ctx) {
  const node = ctx.byId[nodeId]
  return !!node && !node.parentId
}

// The single branch side a non-root node grows on (root defaults to 'right'): the
// side its box already sits on relative to its root's centre. Geometry-driven, like
// MindMapNodeLayer.branchSideOf, so it is right regardless of the stored side tag.
export function branchSideOf(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box || isRootNode(nodeId, ctx)) return 'right'
  return box.x + box.w / 2 >= rootCenterX(nodeId, ctx) ? 'right' : 'left'
}

// The branch side(s) an add-child "+" is offered on: a root grows both ways, any
// other node only on the side it already sits (mirrors addSidesFor).
function addSidesFor(nodeId, ctx) {
  return isRootNode(nodeId, ctx) ? ['right', 'left'] : [branchSideOf(nodeId, ctx)]
}

// Circle-centre x offset from the node's left edge for a "+" on `side`, plus the x
// where its connecting stub leaves the node — both node-local (added to box.x).
function sideGeometry(box, side) {
  return {
    cxLocal: side === 'right' ? box.w + ADD_OFFSET : -ADD_OFFSET,
    stubLocalX: side === 'right' ? box.w : 0,
  }
}

// How many migrated mind-map nodes hang directly off `nodeId`, read from the
// reconstructed tree (each node's parentId) so it counts real children whatever
// their on-canvas position.
export function childCount(nodeId, ctx) {
  return Object.values(ctx.byId).filter((node) => node.parentId === nodeId).length
}

// The children of `nodeId` that sit on `side`, as their absolute boxes sorted
// top→bottom (by laid-out y). A child is "on `side`" when its own geometry puts it
// there — branchSideOf reads box centre vs root centre — so a root's two sides are
// split correctly and a deeper node's children all fall on its branch side.
function childBoxesOnSide(nodeId, ctx, side) {
  return Object.values(ctx.byId)
    .filter((node) => node.parentId === nodeId && branchSideOf(node.id, ctx) === side)
    .map((node) => ctx.boxes[node.id])
    .filter(Boolean)
    .sort((a, b) => a.y - b.y)
}

// One "+" handle in absolute logical coords for inserting a child at ordinal `index`
// on `side`. `cy` is the gap position, `cx` the column it stands in; the stub always
// leaves the node's own edge at mid-height. `straight` marks the lone childless-node
// handle, the only one that draws a stub.
function makeHandle(nodeId, box, side, index, cx, cy, straight) {
  const { stubLocalX } = sideGeometry(box, side)
  return {
    key: `add-${nodeId}-${side}-${index}`,
    nodeId,
    side,
    index,
    cx,
    cy,
    stubX: box.x + stubLocalX,
    stubY: box.y + box.h / 2,
    straight,
  }
}

// The gap-insertion handles for one node on one side (#265). With N children on the
// side there are N+1 slots: index 0 above the top child … index N below the bottom
// one. A childless side gets a single straight "+" at the node's mid-height — "add
// the first child at the same level".
//
// Where each of the N+1 marks lands is gapHandlePoints' job: it measures the actual
// branch curves and puts every "+" in the whitespace between them, which no single
// column could do once a node has enough children for its branches to pack together.
function sideHandles(nodeId, box, side, ctx) {
  const childBoxes = childBoxesOnSide(nodeId, ctx, side)
  if (!childBoxes.length) {
    const { cxLocal } = sideGeometry(box, side)
    return [makeHandle(nodeId, box, side, 0, box.x + cxLocal, box.y + box.h / 2, true)]
  }
  return gapHandlePoints(box, side, childBoxes).map(({ cx, cy }, index) =>
    makeHandle(nodeId, box, side, index, cx, cy, false),
  )
}

// Every "+" handle to draw for one node, in absolute logical coords. A root offers a
// gap column on BOTH sides; any other node only on its branch side. Empty for a shape
// id that is not a migrated mind-map node.
//
// Memoised per context. Placing the marks samples the branch curves, and the hover
// state machine asks for them on every pointer move; a context is rebuilt whenever
// the shapes change, so caching against it can never answer for a stale tree.
const handleCache = new WeakMap()

export function handlesForNode(nodeId, ctx) {
  let byNode = handleCache.get(ctx)
  if (!byNode) handleCache.set(ctx, (byNode = new Map()))
  if (!byNode.has(nodeId)) byNode.set(nodeId, computeHandles(nodeId, ctx))
  return byNode.get(nodeId)
}

function computeHandles(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!ctx.byId[nodeId] || !box) return []
  return addSidesFor(nodeId, ctx).flatMap((side) => sideHandles(nodeId, box, side, ctx))
}

// Whether a node should currently reveal its handles: only with the select tool, and
// only while it is HOVERED (#265) — not on selection, so the gap column appears just
// as the pointer reaches the node. Kept pure and per-node so the component's target
// set is a plain filter over this predicate.
export function shouldShowHandles({
  hovered = false,
  soleSelected = false,
  selectTool = false,
  editing = false,
} = {}) {
  // A node being named is not asking for a child yet (#510). Same argument as the
  // drag suppression: the node already has the user's attention for one thing, and
  // a "+" beside a nameless node asks for the next one before this one exists.
  // Handles return on commit, so Escape or clicking away brings them straight back.
  if (editing) return false
  // #261: a node shows its add-node CTAs while hovered OR while it is the sole
  // selection — so selecting a node (not only hovering it) surfaces the affordance.
  // Which node gets to ask is the caller's decision (#515/#516): this stays a pure
  // per-node test, and only one node is ever put to it.
  return Boolean(selectTool && (hovered || soleSelected))
}

// The ONE node that may offer its handles, or null — hover wins outright, and the
// sole selection only gets to ask when the pointer is over no node at all.
//
// #261 let hover and selection both qualify, evaluated per node, so two nodes drew
// their marks at once whenever the pointer sat on one while another was still
// selected from having just been added (#515) — and a selected node kept its "+" up
// with the pointer right across the canvas (#516). Narrowed rather than dropped: the
// selection route is the only way to add a child without a pointer, which is what
// keyboard and touch depend on.
//
// `hovered` travels with the id because the caller has to tell shouldShowHandles
// WHICH half of the rule let this node through.
export function handleOwnerOf({ hoveredId = null, selection = [], boxes = {} } = {}) {
  if (hoveredId && boxes[hoveredId]) return { id: hoveredId, hovered: true }
  const sole = selection.length === 1 ? selection[0] : null
  if (sole && boxes[sole]) return { id: sole, hovered: false }
  return null
}

// The topmost migrated mind-map node (by zIndex) whose box is under `point`, or
// null. Drives hover: the node the cursor is actually over wins outright.
export function nodeAtPoint(point, shapes) {
  let best = null
  for (const shape of shapes || []) {
    if (!isMindmapShape(shape) || !pointInBox(point, boxOf(shape))) continue
    if (!best || (shape.zIndex || 0) >= (best.zIndex || 0)) best = shape
  }
  return best ? best.id : null
}

// The handle of `nodeId` under `point`, or null. The target is the hit radius, so
// a click lands without pixel-perfect aim (#427 item 1).
//
// Nearest wins, not first-in-list (#511). Spacing now keeps two targets from
// overlapping in a laid-out tree, but the dense-map fallback in mindmapHandleSlots
// places each slot in the roomiest spot it can reach rather than a separated one, so
// two targets can still meet there. List order would send such a click to whichever
// handle came first instead of the one aimed at. Matches how slotAtPoint breaks ties.
export function handleAtPoint(point, nodeId, ctx) {
  let best = null
  for (const handle of handlesForNode(nodeId, ctx)) {
    const distance = Math.hypot(point.x - handle.cx, point.y - handle.cy)
    if (distance > ADD_HIT_R) continue
    if (!best || distance < best.distance) best = { handle, distance }
  }
  return best?.handle || null
}

// Which node owns the hover after the pointer moves to `point` (#427 item 1).
//
// The order matters, and rule 1 is the fix: a "+" belongs to the node that
// offered it, so while the pointer is ON one of the current node's handles that
// node KEEPS the hover — even when the point also falls inside a neighbouring
// node's box, which used to steal it and make the "+" vanish under the cursor.
export function nextHoverTarget({ point, currentId = null, ctx, shapes }) {
  if (currentId && ctx.boxes[currentId] && handleAtPoint(point, currentId, ctx)) return currentId
  const direct = nodeAtPoint(point, shapes)
  if (direct) return direct
  if (currentId && pointInBox(point, hoverRegionOf(currentId, ctx))) return currentId
  return null
}

// The padded region that keeps a node "hovered" while the pointer slides off it
// toward any "+", so the handles do not vanish in the gap (#264). It reaches out
// HOVER_OUT on the branch side(s) to cover the circles, and spans the FULL vertical
// extent of the gap column — from the top handle down to the bottom one — plus the
// node box itself and a small margin, so moving from the node to any "+" (above the
// first child or below the last) never drops the hover.
export function hoverRegionOf(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return null
  const root = isRootNode(nodeId, ctx)
  const side = branchSideOf(nodeId, ctx)
  // The region is measured from the handles themselves rather than a fixed reach:
  // a gap column stands out by the children it slots between (#427), so a constant
  // would stop covering the "+" the moment the layout spaced things differently.
  let left = box.x - (root || side === 'left' ? HOVER_OUT : 6)
  let right = box.x + box.w + (root || side === 'right' ? HOVER_OUT : 6)
  let top = box.y
  let bottom = box.y + box.h
  for (const handle of handlesForNode(nodeId, ctx)) {
    left = Math.min(left, handle.cx - ADD_HIT_R)
    right = Math.max(right, handle.cx + ADD_HIT_R)
    top = Math.min(top, handle.cy - ADD_HIT_R)
    bottom = Math.max(bottom, handle.cy + ADD_HIT_R)
  }
  const margin = 8
  return {
    x: left - margin,
    y: top - margin,
    w: right - left + margin * 2,
    h: bottom - top + margin * 2,
  }
}

// --- slot hover ---------------------------------------------------------------
//
// A slot's own catchment: the whitespace between the two branches it sits between,
// from the node's edge out past its "+". Hovering the fork between two branches is
// how you say "another child, here" — it should offer THAT slot's "+" without
// first hovering the parent and tracing the corridor, and it should offer only
// that one, not the node's whole column.

// The band is at least tall enough to aim at and never taller than the gap it
// belongs to, so two neighbouring slots cannot both claim the same pixel.
const SLOT_BAND_MIN = 20
const SLOT_BAND_MAX = 44
// The furthest a node's own "+" can stand from its box (a column gap plus a child's
// width). Nodes further than this from the pointer cannot own the slot under it, so
// they are skipped before their handles are placed.
const SLOT_REACH = 360

// The vertical room a slot has: the gap between the two children it sits between,
// or the standing GAP for the first, last and childless-node slots.
function slotGapHeight(handle, childBoxes) {
  const above = childBoxes[handle.index - 1]
  const below = childBoxes[handle.index]
  if (!above || !below) return GAP
  return below.y - (above.y + above.h)
}

function slotZone(handle, box, side, childBoxes) {
  const height = Math.min(Math.max(slotGapHeight(handle, childBoxes), SLOT_BAND_MIN), SLOT_BAND_MAX)
  const inner = side === 'right' ? box.x + box.w : box.x
  const outer = side === 'right' ? handle.cx + ADD_HIT_R : handle.cx - ADD_HIT_R
  return {
    x: Math.min(inner, outer),
    y: handle.cy - height / 2,
    w: Math.abs(outer - inner),
    h: height,
  }
}

// Every slot of one node paired with the whitespace it answers for.
export function slotZonesForNode(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return []
  const bySide = {}
  for (const side of addSidesFor(nodeId, ctx)) bySide[side] = childBoxesOnSide(nodeId, ctx, side)
  return handlesForNode(nodeId, ctx).map((handle) => ({
    handle,
    zone: slotZone(handle, box, handle.side, bySide[handle.side] || []),
  }))
}

// The one "+" the pointer is asking for, or null. Ties go to the nearest mark, so
// where two slots' bands touch the pointer gets the one it is actually closest to.
export function slotAtPoint(point, ctx) {
  let best = null
  for (const [nodeId, box] of Object.entries(ctx.boxes)) {
    if (!pointInBox(point, { x: box.x - SLOT_REACH, y: box.y - SLOT_REACH, w: box.w + SLOT_REACH * 2, h: box.h + SLOT_REACH * 2 })) continue
    for (const { handle, zone } of slotZonesForNode(nodeId, ctx)) {
      if (!pointInBox(point, zone)) continue
      const distance = Math.hypot(point.x - handle.cx, point.y - handle.cy)
      if (!best || distance < best.distance) best = { handle, distance }
    }
  }
  return best?.handle || null
}
