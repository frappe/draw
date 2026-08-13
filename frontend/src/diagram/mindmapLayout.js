// Balanced mind-map auto-layout — pure, O(n) (spec diagram-types A6, Part G7).
// layoutMindMap(model) returns { positions: { [id]: {x,y,w,h} }, bbox: {w,h} }
// with coordinates normalised so the content's top-left sits at (0,0), letting
// the canvas reuse its existing fit-to-view centring. Positions are derived,
// never stored (Part G6). Built simplest-correct: a one-sided placer, applied
// rightward and (mirrored) leftward, with the root centred between the sides.

import { childrenOf, nodeById, subtreeIds, rootNodes, treeOrigin } from './mindmapModel.js'
import { mindmapNodeSize, NODE_PAD_X, LINE_HEIGHT } from './mindmapNodeSize.js'
import { unionBounds } from './geometry.js'
import { tidySubtree, tidyGroup } from './mindmapTidy.js'

const H_GAP = 70 // horizontal gap between depth columns
// Vertical gap between sibling subtrees. Wide enough to hold an add-node "+" with
// air on both sides (#427): with a denser stack the marks fit only by touching the
// boxes they sit between, and the map itself reads as a wall rather than a tree.
const V_GAP = 26
const PAD = 60 // margin around the whole tree after normalising

// Re-exported so the renderer insets its text box (and thus wraps) at exactly the
// width the layout measured against — keeps rendered lines and measured height
// in lockstep, so text never overflows the pill (spec A9, no-overflow rule).
export const PAD_X = NODE_PAD_X
export const LINE_H = LINE_HEIGHT

// A node's box, derived from its text. Delegates to mindmapNodeSize so the framed
// layout and the free-floating shapes can never drift apart (#427): one heuristic,
// one set of constants, measured once and used by creation, layout, renderer and
// editor alike.
export function measureNodeSize(node, isRoot = false) {
  return mindmapNodeSize({ text: node.text, fontSize: node.fontSize, isRoot })
}

// Lay out every tree on the map (#48), each around its own root and shifted by
// that root's origin, into ONE positions map keyed by node id — so every consumer
// (renderer, minimap, thumbnail, export) keeps reading a flat id → box map.
export function layoutMindMap(model) {
  const roots = rootNodes(model)
  if (!roots.length) return { positions: {}, bbox: { x: 0, y: 0, w: 0, h: 0 } }
  const sizes = sizeNodes(model)
  const positions = {}
  // The anchor is the first tree's layout BEFORE its own origin is applied, so it
  // is fixed for a given set of nodes: moving ANY tree — the first one included —
  // then moves only that tree (#48).
  let anchor = null
  for (const root of roots) {
    const tree = {}
    placeRoot(model, root, sizes, tree)
    if (!anchor) anchor = bounds(Object.values(tree))
    const origin = treeOrigin(root)
    for (const id in tree) {
      positions[id] = { ...tree[id], x: tree[id].x + origin.x, y: tree[id].y + origin.y }
    }
  }
  return normalise(positions, anchor)
}

function sizeNodes(model) {
  const sizes = {}
  for (const node of model.nodes) {
    // Read the node's own parent rather than isRoot()'s id lookup — this runs for
    // every node of every layout pass, and the answer is right here.
    sizes[node.id] = measureNodeSize(node, !node.parentId)
  }
  return sizes
}

// The laid-out boxes of one tree (collapsed descendants get no position, so they
// are simply absent).
function treeBoxes(model, positions, root) {
  return subtreeIds(model, root.id)
    .map((id) => positions[id])
    .filter(Boolean)
}

// The padded rect each tree occupies, in the same coordinates as `positions` —
// the canvas draws one select/move hit-rect per tree from these (#48).
export function mindmapTreeRects(model, positions, pad = 0) {
  const rects = []
  for (const root of rootNodes(model)) {
    const boxes = treeBoxes(model, positions, root)
    if (!boxes.length) continue
    const b = bounds(boxes)
    rects.push({
      rootId: root.id,
      x: b.minX - pad,
      y: b.minY - pad,
      w: b.maxX - b.minX + pad * 2,
      h: b.maxY - b.minY + pad * 2,
    })
  }
  return rects
}

// The vertical shape of one branch, packed by contour (mindmapTidy): where every
// node under it sits relative to the branch itself.
function tidyBranch(model, branch, sizes) {
  return tidySubtree(branch, {
    sizeOf: (node) => sizes[node.id],
    childrenOf: (node) => (node.collapsed ? [] : childrenOf(model, node.id)),
    gap: V_GAP,
  })
}

// Root centred at the origin; first-level branches split left/right (alternating
// by order for a deterministic, roughly balanced split), each side mirrored.
function placeRoot(model, root, sizes, positions) {
  const rootSize = sizes[root.id]
  positions[root.id] = { x: -rootSize.w / 2, y: -rootSize.h / 2, ...rootSize }

  // Split first-level branches into sides. A branch with an explicit `side`
  // (set when it was added from a specific "+" ) goes there; the rest alternate
  // for a balanced default.
  const branches = childrenOf(model, root.id)
  const right = []
  const left = []
  let autoIndex = 0
  for (const branch of branches) {
    if (branch.side === 'right') right.push(branch)
    else if (branch.side === 'left') left.push(branch)
    else (autoIndex++ % 2 === 0 ? right : left).push(branch)
  }

  placeSide(model, right, rootSize.w / 2 + H_GAP, 1, sizes, positions)
  placeSide(model, left, -rootSize.w / 2 - H_GAP, -1, sizes, positions)
}

// Stack a side's branches, each clearing the ones already placed at the depths they
// share, with the group centred on the root (y=0).
function placeSide(model, branches, attachX, dir, sizes, positions) {
  if (!branches.length) return
  const tidied = branches.map((branch) => tidyBranch(model, branch, sizes))
  const shifts = tidyGroup(tidied, V_GAP)
  branches.forEach((branch, index) => {
    place(model, branch, attachX, shifts[index], dir, sizes, tidied[index], positions)
  })
}

// Position a branch and everything under it. `centerY` is the branch's own centre;
// each descendant sits at its packed offset from it, and each depth is one column
// further out in direction `dir` (+1 right, -1 left).
function place(model, node, attachX, centerY, dir, sizes, tidied, positions) {
  const columnX = { [node.id]: attachX }
  for (const [id, dy] of tidied.offsets) {
    const size = sizes[id]
    const attach = columnX[id]
    const x = dir > 0 ? attach : attach - size.w
    positions[id] = { x, y: centerY + dy - size.h / 2, ...size }
    const nodeAt = nodeById(model, id)
    const children = nodeAt?.collapsed ? [] : childrenOf(model, id)
    const childAttach = dir > 0 ? x + size.w + H_GAP : x - H_GAP
    for (const child of children) columnX[child.id] = childAttach
  }
}

// Shift a laid-out map to sit at `origin` on the shared canvas. The mind map is
// auto-laid-out around its own zero point; on the unified canvas it is an
// ordinary canvas object, so folding its origin into the positions keeps node
// hit-testing and dragging in plain canvas units (no per-object transform maths).
// A non-finite origin coordinate falls back to 0 rather than propagating NaN
// through every box (which would drop the whole map out of the render).
export function offsetPositions(positions, origin) {
  const dx = Number.isFinite(origin?.x) ? origin.x : 0
  const dy = Number.isFinite(origin?.y) ? origin.y : 0
  if (!positions || (dx === 0 && dy === 0)) return positions
  const shifted = {}
  for (const id in positions) {
    shifted[id] = { ...positions[id], x: positions[id].x + dx, y: positions[id].y + dy }
  }
  return shifted
}

// True when a node is hidden because one of its ancestors is collapsed. The node
// itself being collapsed does not hide it (only its descendants). Used by the
// renderer so collapsed subtrees draw nothing (and the layout gave them no space).
export function isNodeHidden(model, id) {
  let node = nodeById(model, id)
  while (node && node.parentId) {
    const parent = nodeById(model, node.parentId)
    if (parent?.collapsed) return true
    node = parent
  }
  return false
}

// Count of descendants hidden under a collapsed node (for its count badge).
export function hiddenDescendantCount(model, id) {
  const node = nodeById(model, id)
  if (!node?.collapsed) return 0
  return subtreeIds(model, id).length - 1
}

// A smooth cubic between two edge points, fanning horizontally: each control point
// shares its endpoint's y, so the curve leaves the parent AND eases into the child
// horizontally (tangents flat at both ends) and mirrors for up vs down branches.
// Shared by the legacy layout and the free-floating branch connector (#266).
export function branchPathPoints(start, end) {
  const [p0, p1, p2, p3] = branchControlPoints(start, end)
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`
}

// The same curve as four points instead of a path string, so code that has to
// REASON about where a branch runs — the "+" placement, which keeps out of the
// branches' way (#427) — measures the curve that is actually drawn rather than an
// approximation of it.
export function branchControlPoints(start, end) {
  const midX = (start.x + end.x) / 2
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
}

// A smooth cubic-bezier path from a parent box edge to a child box edge, fanning
// horizontally (control points pulled toward each other on x). `side` is +1 when
// the child sits to the right of the parent, -1 to the left (spec A4 curves).
export function branchPath(parentBox, childBox) {
  const side = childBox.x >= parentBox.x ? 1 : -1
  return branchPathPoints(edgePoint(parentBox, side), edgePoint(childBox, -side))
}

// The middle of a box's left (side<0) or right (side>0) edge.
function edgePoint(box, side) {
  return { x: side > 0 ? box.x + box.w : box.x, y: box.y + box.h / 2 }
}

// Shift all positions so the FIRST tree's top-left sits at the margin, and report
// the bounding box of everything relative to that same anchor (x/y are 0 for a
// single tree, and negative for a tree placed above/left of the first one).
//
// Anchoring on the first tree rather than on the union is what keeps trees
// independent (#48): adding or dragging one tree leaves every other tree's
// coordinates untouched, where a union anchor would slide them all sideways.
function normalise(positions, anchor) {
  const boxes = Object.values(positions)
  if (!boxes.length) return { positions, bbox: { x: 0, y: 0, w: 0, h: 0 } }
  const dx = PAD - anchor.minX
  const dy = PAD - anchor.minY
  const shifted = {}
  for (const [id, box] of Object.entries(positions)) {
    shifted[id] = { ...box, x: box.x + dx, y: box.y + dy }
  }
  const b = bounds(Object.values(shifted))
  return {
    positions: shifted,
    bbox: {
      x: b.minX - PAD,
      y: b.minY - PAD,
      w: b.maxX - b.minX + PAD * 2,
      h: b.maxY - b.minY + PAD * 2,
    },
  }
}

// Min/max extent of a non-empty list of boxes, in the {minX,minY,maxX,maxY} shape
// this module's placement math reads. Delegates to unionBounds so the no-spread
// stability fix (B7 — Math.min/max(...array) overflows the argument limit on a huge
// map) lives in one place; callers here always pass a non-empty list.
function bounds(boxes) {
  const b = unionBounds(boxes)
  return b
    ? { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 }
}
