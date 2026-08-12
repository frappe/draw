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
// --- geometry constants ------------------------------------------------------
// The mark is small and quiet; the TARGET is large (#427 items 1 and 7). They are
// separate numbers on purpose — an affordance that competes with the branches for
// attention is not the same problem as one that is hard to hit, and the old single
// radius could only ever trade one against the other.
export const ADD_R = 7 // drawn "+" circle radius
export const ADD_HIT_R = 15 // invisible hit radius around that circle
export const ADD_OFFSET = 28 // gap from the node edge to the "+" centre
export const GLYPH = 3.5 // half-length of the white "+" strokes inside a circle
// Vertical breathing room for the two extreme gap handles: the "above the first
// child" "+" sits GAP/2 above the top child's edge, the "below the last child" one
// GAP/2 below the bottom child's edge (about one "+" radius clear of the boxes).
export const GAP = 24
// How far a gap handle stands clear of the child column it slots into, so the mark
// has air on both sides rather than touching the box it precedes.
export const HANDLE_INSET = 20
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

// The N+1 gap y's for the sorted children on a side: one above the top child, one
// in each gap between adjacent children (midpoint of their vertical centres), one
// below the bottom child — so the handles interleave with the children (H,C,H,…,H).
function gapCenters(childBoxes) {
  const mid = (box) => box.y + box.h / 2
  const ys = [childBoxes[0].y - GAP / 2]
  for (let i = 0; i < childBoxes.length - 1; i += 1) ys.push((mid(childBoxes[i]) + mid(childBoxes[i + 1])) / 2)
  const last = childBoxes[childBoxes.length - 1]
  ys.push(last.y + last.h + GAP / 2)
  return ys
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

// The column a node's gap handles stand in: just before the children they slot
// between, NOT beside the parent (#427). Every branch leaves the parent from one
// point, so next to the parent the curves are still bundled and a "+" dropped in
// there lands on top of them. A whole column out, each curve has reached its own
// child, and the gap between two children is empty — which is also exactly where
// the new node will appear. Clamped so it can never sit closer to the parent than
// a childless node's handle would.
function gapColumnX(box, side, childBoxes) {
  if (side === 'left') {
    const columnEdge = Math.max(...childBoxes.map((child) => child.x + child.w))
    return Math.min(columnEdge + HANDLE_INSET, box.x - ADD_OFFSET)
  }
  const columnEdge = Math.min(...childBoxes.map((child) => child.x))
  return Math.max(columnEdge - HANDLE_INSET, box.x + box.w + ADD_OFFSET)
}

// The gap-insertion handles for one node on one side (#265). With N children on the
// side there are N+1 slots: index 0 above the top child … index N below the bottom
// one. A childless side gets a single straight "+" at the node's mid-height — "add
// the first child at the same level".
function sideHandles(nodeId, box, side, ctx) {
  const childBoxes = childBoxesOnSide(nodeId, ctx, side)
  if (!childBoxes.length) {
    const { cxLocal } = sideGeometry(box, side)
    return [makeHandle(nodeId, box, side, 0, box.x + cxLocal, box.y + box.h / 2, true)]
  }
  const cx = gapColumnX(box, side, childBoxes)
  return gapCenters(childBoxes).map((cy, index) => makeHandle(nodeId, box, side, index, cx, cy, false))
}

// Every "+" handle to draw for one node, in absolute logical coords. A root offers a
// gap column on BOTH sides; any other node only on its branch side. Empty for a shape
// id that is not a migrated mind-map node.
export function handlesForNode(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!ctx.byId[nodeId] || !box) return []
  return addSidesFor(nodeId, ctx).flatMap((side) => sideHandles(nodeId, box, side, ctx))
}

// Whether a node should currently reveal its handles: only with the select tool, and
// only while it is HOVERED (#265) — not on selection, so the gap column appears just
// as the pointer reaches the node. Kept pure and per-node so the component's target
// set is a plain filter over this predicate.
export function shouldShowHandles({ hovered = false, soleSelected = false, selectTool = false } = {}) {
  // #261: a node shows its add-node CTAs while hovered OR while it is the sole
  // selection — so selecting a node (not only hovering it) surfaces the affordance.
  return Boolean(selectTool && (hovered || soleSelected))
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
export function handleAtPoint(point, nodeId, ctx) {
  for (const handle of handlesForNode(nodeId, ctx)) {
    const dx = point.x - handle.cx
    const dy = point.y - handle.cy
    if (dx * dx + dy * dy <= ADD_HIT_R * ADD_HIT_R) return handle
  }
  return null
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
// The hover region MINUS the node's own box: the strips to either side, which is
// all the corridor that needs painting. Covering the node too would put a
// transparent sheet over its own cursor zones and its link badge — the node would
// stop offering the I-beam that says "click to edit" exactly while hovered (#123).
export function hoverStripsOf(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  const region = hoverRegionOf(nodeId, ctx)
  if (!box || !region) return []
  return [
    { x: region.x, y: region.y, w: Math.max(0, box.x - region.x), h: region.h },
    {
      x: box.x + box.w,
      y: region.y,
      w: Math.max(0, region.x + region.w - (box.x + box.w)),
      h: region.h,
    },
  ].filter((strip) => strip.w > 0)
}

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
