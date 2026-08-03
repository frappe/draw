// Pure geometry for the migrated flowchart "+" add-handle overlay (issue #77, the
// flowchart counterpart of the mind-map "+" handles from #118).
//
// FlowchartHoverHandles.vue draws the on-canvas "+" affordance that lets mouse
// users grow a migrated flowchart without the keyboard (D/T/I add typed steps).
// vitest is headless (no @vue/test-utils), so the component stays a thin renderer
// and every decision that can go wrong — where the "+" sits, when it shows, which
// node the pointer is over — lives here and is unit-tested.
//
// A migrated flowchart node is an ordinary shape (role 'flowchart-node') with
// absolute x/y/w/h, so — like mindmapHandles.js, and unlike FlowchartLayer.vue
// which works in node-local coords under a per-node <g translate> — these handles
// are produced directly in ABSOLUTE logical canvas units and rendered straight
// into the viewport <g>. The radius/glyph/colour conventions mirror the mind-map
// handles so the two migrated-shape overlays read as one feature.
//
// A single "+" sits at the node's EXIT (bottom-centre for the default TB flow the
// migrated add-path uses — see buildFlowchartChild/placeChild, which drop the new
// step one level DOWN). The exit point matches FlowchartLayer's portPoint(node,
// 'out', 'TB'): for every node type the outgoing TB port is the bottom-centre of
// the box (a decision's diamond bottom vertex included), so one formula covers all
// types. addFlowchartChildShape routes a decision through its next free Yes/No
// branch, so a single "+" is enough there too.

import { isFlowchartShape } from './freeFloating.js'

// --- geometry constants (shared with the mind-map handles for visual parity) ----
export const ADD_R = 11 // "+" circle radius
export const ADD_OFFSET = 28 // gap from the node's exit edge to the "+" centre
export const GLYPH = 4.5 // half-length of the white "+" strokes inside a circle
// The hover region reaches this far below the node, so sliding the pointer off the
// node's bottom edge onto its "+" keeps the handle alive (mirrors HOVER_OUT). The
// "+" circle's far edge is ADD_OFFSET + ADD_R (39) down; +12 leaves a margin.
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

// The bottom-centre exit point of a node box — where the outgoing TB edge leaves,
// and where the "+" hangs from. Matches FlowchartLayer's portPoint(node,'out','TB').
function exitPoint(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h }
}

// A reusable index of the migrated flowchart: each node's absolute box keyed by id
// (for placement + hit-testing). Built once per render from the shared shapes and
// threaded through the pure helpers below. Placement needs only the box — the "+"
// is a single bottom exit regardless of graph shape — so unlike the mind-map ctx
// this holds no reconstructed tree.
export function buildContext(shapes) {
  const boxes = {}
  for (const shape of shapes || []) {
    if (isFlowchartShape(shape)) boxes[shape.id] = boxOf(shape)
  }
  return { boxes }
}

// The "+" handle(s) to draw for one node, in absolute logical coords: a single
// add-child "+" centred ADD_OFFSET below the node's exit edge, with a short stub
// from the exit point down to the circle. Returned as an array (always length 1
// for a flowchart node) so the component renders it with the same flatMap pass as
// the mind-map overlay. Empty for a shape id that is not a migrated flowchart node.
export function handlesForNode(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return []
  const exit = exitPoint(box)
  return [
    {
      key: `add-${nodeId}`,
      kind: 'child',
      nodeId,
      cx: exit.x,
      cy: exit.y + ADD_OFFSET,
      stubX: exit.x,
      stubY: exit.y,
    },
  ]
}

// Whether a node should currently reveal its handle: only with the select tool,
// and only while it is hovered or the sole selection (mirrors the mind-map
// shouldShowHandles / FlowchartLayer.isActive). Kept pure and per-node so the
// component's target set is a plain filter over this predicate.
export function shouldShowHandles({ hovered = false, soleSelected = false, selectTool = false } = {}) {
  return Boolean(selectTool && (hovered || soleSelected))
}

// The topmost migrated flowchart node (by zIndex) whose box is under `point`, or
// null. Drives hover: the node the cursor is actually over wins outright.
export function nodeAtPoint(point, shapes) {
  let best = null
  for (const shape of shapes || []) {
    if (!isFlowchartShape(shape) || !pointInBox(point, boxOf(shape))) continue
    if (!best || (shape.zIndex || 0) >= (best.zIndex || 0)) best = shape
  }
  return best ? best.id : null
}

// The padded region that keeps a node "hovered" while the pointer slides off its
// bottom edge toward the "+", so the handle does not vanish in the gap (mirrors
// the mind-map hoverRegionOf). It only extends downward, past the "+" circle.
export function hoverRegionOf(nodeId, ctx) {
  const box = ctx.boxes[nodeId]
  if (!box) return null
  return {
    x: box.x - 6,
    y: box.y - 8,
    w: box.w + 12,
    h: box.h + HOVER_OUT,
  }
}
