// Where a dragged mind-map node can be dropped (#427 item 4), as pure geometry.
//
// A mind map is auto-laid-out: dragging never places a node at a point, it moves
// the node in the TREE and lets the layout place it. So a drag resolves to one of
// two things — become child number N of some parent, or become that parent's last
// child — and this module decides which, from the pointer position alone.
//
// The slots come from the "+" handle positions (mindmapHandles), deliberately: the
// ordinal you can drop a node into is exactly the ordinal a "+" would have added
// one at, so the two affordances can never disagree about where a child goes.
//
// The context is built from the shapes MINUS the dragged subtree, so slots describe
// the tree as it will be once the node has left its old place.

import { buildContext, handlesForNode, pointInBox, branchSideOf } from './mindmapHandles.js'
import { mindmapModelFromShapes } from './freeFloatingGraph.js'
import { subtreeIds } from './mindmapModel.js'
import { isMindmapShape } from './freeFloating.js'

// How far from a gap the pointer may be and still land in it. Generous, because a
// mind map is mostly empty space and the nearest slot is nearly always the one
// meant — the alternative is a drag that silently does nothing.
export const DROP_CAPTURE = 90

// The column a childless parent's first child would occupy, measured from the
// parent's edge (freeFloatingOps GAP_X plus half a default node).
const COLUMN_GAP = 130

// The shapes of the tree the dragged node belongs to, without the node's own
// subtree — the tree the drop is being aimed at.
export function contextWithout(shapes, draggedId) {
  const model = mindmapModelFromShapes(shapes)
  const moving = new Set(subtreeIds(model, draggedId))
  return buildContext((shapes || []).filter((shape) => !moving.has(shape.id)))
}

// Where a gap slot is AIMED at, which is not where its "+" is drawn. The "+" sits
// just off the parent's edge, but a node is dragged to where it should end up —
// into the column its new siblings occupy, a whole gap further out. Measuring from
// the parent's edge instead put every slot ~100 units from the natural drop point,
// which is to say out of reach.
function slotColumnX(parentId, side, ctx) {
  const siblings = Object.keys(ctx.byId)
    .filter((id) => ctx.byId[id].parentId === parentId && branchSideOf(id, ctx) === side)
    .map((id) => ctx.boxes[id])
    .filter(Boolean)
  if (siblings.length) return siblings[0].x + siblings[0].w / 2
  const box = ctx.boxes[parentId]
  return side === 'left' ? box.x - COLUMN_GAP : box.x + box.w + COLUMN_GAP
}

// Every slot the dragged node could take: one "become child N of P" per gap in
// each remaining node's child column, plus one "become P's last child" per node.
// A gap keeps its handle's y — the ordinal it marks — but is aimed at the child
// column, where the node is actually being dragged to.
export function dropSlotsFor(ctx, draggedId) {
  const slots = []
  for (const nodeId of Object.keys(ctx.boxes)) {
    if (nodeId === draggedId) continue
    slots.push({ kind: 'onto', parentId: nodeId, box: ctx.boxes[nodeId] })
    for (const handle of handlesForNode(nodeId, ctx)) {
      const x = slotColumnX(nodeId, handle.side, ctx)
      slots.push({ kind: 'gap', parentId: nodeId, side: handle.side, index: handle.index, x, y: handle.cy })
    }
  }
  return slots
}

function distanceSquared(slot, point) {
  return (slot.x - point.x) ** 2 + (slot.y - point.y) ** 2
}

// The slot under the pointer. A node the pointer is actually inside wins — that
// reads as "put it in here" — otherwise the nearest gap within reach.
export function dropTargetAt(point, slots) {
  const inside = slots.find((slot) => slot.kind === 'onto' && pointInBox(point, slot.box))
  if (inside) return inside
  let best = null
  let bestDistance = DROP_CAPTURE ** 2
  for (const slot of slots) {
    if (slot.kind !== 'gap') continue
    const distance = distanceSquared(slot, point)
    if (distance > bestDistance) continue
    best = slot
    bestDistance = distance
  }
  return best
}

// What to draw for a slot: a bar across the gap the node will drop into, or a ring
// around the parent it will be appended to.
export function indicatorFor(slot, ctx) {
  if (!slot) return null
  if (slot.kind === 'onto') return { kind: 'ring', ...ctx.boxes[slot.parentId] }
  const direction = slot.side === 'left' ? -1 : 1
  return { kind: 'bar', x1: slot.x - 14 * direction, y1: slot.y, x2: slot.x + 26 * direction, y2: slot.y }
}

// The children a slot's ordinal counts against: the target parent's children on
// that side, in their current order, WITHOUT the node being dragged — the slots
// describe the tree as it will be once that node has left. A root splits its
// children between two sides, so only the slot's own side counts.
export function siblingsForSlot(shapes, slot, ctx, draggedId = null) {
  const parentIsRoot = !ctx.byId[slot.parentId]?.parentId
  return (shapes || [])
    .filter((shape) => isMindmapShape(shape) && shape.mindmap?.parentId === slot.parentId)
    .filter((shape) => shape.id !== draggedId)
    .filter((shape) => !parentIsRoot || slot.kind === 'onto' || branchSideOf(shape.id, ctx) === slot.side)
    .sort((a, b) => (a.mindmap?.order ?? 0) - (b.mindmap?.order ?? 0))
}

// A fractional order that sorts the node into position `index` among `siblings`.
// The store densifies it back to clean integers once it is in place — the same
// trick gap-insertion already uses for the "+".
export function orderForSlot(siblings, index) {
  const orderAt = (i) => siblings[i].mindmap?.order ?? 0
  if (!siblings.length) return 0
  if (index <= 0) return orderAt(0) - 0.5
  if (index >= siblings.length) return orderAt(siblings.length - 1) + 0.5
  return (orderAt(index - 1) + orderAt(index)) / 2
}

// The side a node takes under a new parent: a root's children carry the side the
// slot was on; deeper down, a branch grows one way, so the parent's side wins.
function sideUnder(parentNode, slot) {
  if (parentNode?.parentId) return parentNode.side || 'right'
  return slot.side || 'right'
}

// The tag changes that move `draggedId` into `slot`: the node's own parent, side,
// order and depth, plus the depth and side its descendants inherit. Pure — the
// store applies these, re-points the branch connector, and re-flows, all in one
// commit.
export function dropPatches(shapes, draggedId, slot) {
  const ctx = contextWithout(shapes, draggedId)
  if (!slot || !ctx.boxes[slot.parentId]) return { nodes: [] }
  const parentNode = ctx.byId[slot.parentId]
  const side = sideUnder(parentNode, slot)
  const depth = (parentNode?.depth ?? 0) + 1
  const siblings = siblingsForSlot(shapes, slot, ctx, draggedId)
  const order = slot.kind === 'onto' ? orderForSlot(siblings, siblings.length) : orderForSlot(siblings, slot.index)
  const moved = { id: draggedId, parentId: slot.parentId, side, order, depth }
  return { nodes: [moved, ...descendantPatches(shapes, draggedId, side, depth)] }
}

// Everything under the dragged node keeps its shape but moves with it: same branch
// side, depths shifted by however far the node itself moved.
function descendantPatches(shapes, draggedId, side, depth) {
  const model = mindmapModelFromShapes(shapes)
  const dragged = model.nodes.find((node) => node.id === draggedId)
  const shift = depth - (dragged?.depth ?? 0)
  return subtreeIds(model, draggedId)
    .filter((id) => id !== draggedId)
    .map((id) => {
      const node = model.nodes.find((candidate) => candidate.id === id)
      return { id, side, depth: (node?.depth ?? 0) + shift }
    })
}

// A drop that would change nothing: back into the node's own slot, or onto the
// parent it is already the last child of. Worth catching so an accidental nudge
// does not land an empty undo step on the stack.
export function isNoOpDrop(shapes, draggedId, slot) {
  if (!slot) return true
  const dragged = (shapes || []).find((shape) => shape.id === draggedId)
  if (!dragged || dragged.mindmap?.parentId !== slot.parentId) return false
  const ctx = contextWithout(shapes, draggedId)
  // Crossing to the root's other side is a real move even though the parent and
  // the ordinal are unchanged — the node ends up somewhere visibly different.
  if (slot.kind === 'gap' && sideOfDragged(shapes, draggedId) !== slot.side) return false
  const siblings = siblingsForSlot(shapes, slot, ctx, draggedId)
  // The ordinal the node already occupies among the siblings that are staying put.
  const order = dragged.mindmap?.order ?? 0
  const held = siblings.filter((shape) => (shape.mindmap?.order ?? 0) < order).length
  return slot.kind === 'onto' ? held === siblings.length : slot.index === held
}

// The branch side the dragged node currently sits on, read from its geometry (the
// stored tag can lag a re-flow) with the tag as the fallback.
function sideOfDragged(shapes, draggedId) {
  const ctx = buildContext(shapes)
  if (ctx.boxes[draggedId]) return branchSideOf(draggedId, ctx)
  return (shapes || []).find((shape) => shape.id === draggedId)?.mindmap?.side || 'right'
}
