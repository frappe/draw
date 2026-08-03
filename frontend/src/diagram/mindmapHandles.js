// Pure geometry for the migrated mind-map "+" add-handles overlay (issue #118).
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

// --- geometry constants (identical to MindMapNodeLayer.vue) ------------------
export const ADD_R = 11 // "+" circle radius
export const ADD_OFFSET = 28 // gap from the node edge to the "+" centre
export const SIB_DY = ADD_R * 2 + 6 // 28 — child-"+" → sibling-"+" drop (one diameter + 6px gap)
export const GLYPH = 4.5 // half-length of the white "+" strokes inside a circle
// The hover region reaches this far past the branch edge, so sliding the pointer
// off the node onto its "+" keeps the handles alive (mirrors HOVER_OUT).
export const HOVER_OUT = ADD_OFFSET + ADD_R + 12 // 51

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

function childHandle(nodeId, box, side) {
  const { cxLocal, stubLocalX } = sideGeometry(box, side)
  return {
    key: `child-${nodeId}-${side}`,
    kind: 'child',
    nodeId,
    side,
    cx: box.x + cxLocal,
    cy: box.y + box.h / 2,
    stubX: box.x + stubLocalX,
    stubY: box.y + box.h / 2,
  }
}

// A second "+" one diameter below the child "+", on the same branch side — adds a
// true sibling (addSiblingNode). Its stub runs diagonally from the node edge at
// mid-height down to the circle, exactly like MindMapNodeLayer's parallel button.
function siblingHandle(nodeId, box, side) {
  const { cxLocal, stubLocalX } = sideGeometry(box, side)
  return {
    key: `sibling-${nodeId}-${side}`,
    kind: 'sibling',
    nodeId,
    side,
    cx: box.x + cxLocal,
    cy: box.y + box.h / 2 + SIB_DY,
    stubX: box.x + stubLocalX,
    stubY: box.y + box.h / 2,
  }
}

// How many migrated mind-map nodes hang directly off `nodeId`, read from the
// reconstructed tree (each node's parentId) so it counts real children whatever
// their on-canvas position.
export function childCount(nodeId, ctx) {
  return Object.values(ctx.byId).filter((node) => node.parentId === nodeId).length
}

// Whether a node still offers the add-child "+". Once a non-root node has a child
// of its own the add-child "+" is redundant with the add-another-child (sibling)
// "+" beneath it, so it drops away and only the sibling "+" remains (#129). A root
// always keeps its add-child "+"(s) — it has no sibling "+" — and a childless node
// keeps its initial add-child "+".
export function offersAddChild(nodeId, ctx) {
  return isRootNode(nodeId, ctx) || childCount(nodeId, ctx) === 0
}

// Every "+" handle to draw for one node, in absolute logical coords. A root offers
// only an add-child "+" on BOTH sides (it has no sibling). A non-root node offers
// an add-sibling ("add another child") "+" below it, plus — only until it has a
// child of its own — an add-child "+" on its branch side; after the first child
// that add-child "+" is redundant and drops away (#129). Empty for a shape id that
// is not a migrated mind-map node.
export function handlesForNode(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!ctx.byId[nodeId] || !box) return []
  const handles = offersAddChild(nodeId, ctx)
    ? addSidesFor(nodeId, ctx).map((side) => childHandle(nodeId, box, side))
    : []
  if (!isRootNode(nodeId, ctx)) handles.push(siblingHandle(nodeId, box, branchSideOf(nodeId, ctx)))
  return handles
}

// Whether a node should currently reveal its handles: only with the select tool,
// and only while it is hovered or the sole selection (mirrors showAdd). Kept pure
// and per-node so the component's target set is a plain filter over this predicate.
export function shouldShowHandles({ hovered = false, soleSelected = false, selectTool = false } = {}) {
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

// The padded region that keeps a node "hovered" while the pointer slides off it
// toward its "+", so the handles do not vanish in the gap (mirrors hoverPad). It
// only extends toward the branch side(s) and down past the sibling "+".
export function hoverRegionOf(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return null
  const root = isRootNode(nodeId, ctx)
  const side = branchSideOf(nodeId, ctx)
  const left = root || side === 'left' ? HOVER_OUT : 6
  const right = root || side === 'right' ? HOVER_OUT : 6
  return {
    x: box.x - left,
    y: box.y - 8,
    w: box.w + left + right,
    h: box.h + SIB_DY + ADD_R + 14,
  }
}
