// Balanced mind-map auto-layout — pure, O(n) (spec diagram-types A6, Part G7).
// layoutMindMap(model) returns { positions: { [id]: {x,y,w,h} }, bbox: {w,h} }
// with coordinates normalised so the content's top-left sits at (0,0), letting
// the canvas reuse its existing fit-to-view centring. Positions are derived,
// never stored (Part G6). Built simplest-correct: a one-sided placer, applied
// rightward and (mirrored) leftward, with the root centred between the sides.

import { childrenOf, nodeById, subtreeIds, rootNodes, treeOrigin } from './mindmapModel.js'
import { wrapLineCount, charsPerLine } from './textMetrics.js'
import { unionBounds } from './geometry.js'

const H_GAP = 70 // horizontal gap between depth columns
const V_GAP = 18 // vertical gap between sibling subtrees
const PAD = 60 // margin around the whole tree after normalising

const CHAR_W = 8.5
// Exported so the renderer insets its text box (and thus wraps) at exactly the
// width the layout measured against — keeps rendered lines and measured height
// in lockstep, so text never overflows the pill (spec A9, no-overflow rule).
export const PAD_X = 28
const PAD_Y = 18
export const LINE_H = 22
const MIN_W = 140 // default node width (2× the old 70 — wider resting pill)
const MAX_W = 200 // horizontal cap: text wraps to a new line past this, then grows down

// Deterministic node box from its text (no DOM measurement, so it is unit
// testable). Width grows with text up to MAX_W; beyond that the text wraps and
// the box grows downward (more lines) with no vertical limit — the renderer
// wraps at the same width so what's drawn always fits (no overflow).
export function measureNodeSize(node, isRoot = false) {
  // Scale the character/line metrics by the node's chosen font size (default 14)
  // so a larger pill grows to fit bigger text (spec A9 font-size control).
  const fontScale = (node.fontSize || (isRoot ? 17 : 14)) / 14
  const charWidth = CHAR_W * fontScale
  const lineHeight = LINE_H * fontScale
  const text = node.text || ''
  const singleLineWidth = text.length * charWidth + PAD_X
  const width = clamp(singleLineWidth, MIN_W * fontScale, MAX_W * fontScale)
  // How many lines the text wraps to inside the padded box, packing whole words
  // (mirroring CSS normal wrapping) so the height fits the rendered text.
  const lines = wrapLineCount(text, charsPerLine(width - PAD_X, charWidth))
  const height = lines * lineHeight + PAD_Y
  return { w: Math.round(width), h: Math.round(height) }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// Lay out every tree on the map (#48), each around its own root and shifted by
// that root's origin, into ONE positions map keyed by node id — so every consumer
// (renderer, minimap, thumbnail, export) keeps reading a flat id → box map.
export function layoutMindMap(model) {
  const roots = rootNodes(model)
  if (!roots.length) return { positions: {}, bbox: { x: 0, y: 0, w: 0, h: 0 } }
  const sizes = sizeNodes(model)
  const metrics = makeSubtreeMetrics(model, sizes)
  const positions = {}
  // The anchor is the first tree's layout BEFORE its own origin is applied, so it
  // is fixed for a given set of nodes: moving ANY tree — the first one included —
  // then moves only that tree (#48).
  let anchor = null
  for (const root of roots) {
    const tree = {}
    placeRoot(model, root, sizes, metrics, tree)
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

// Memoised subtree heights + the stacked-band height of a sibling group.
// A node's subtree height is its own height or its children band, whichever is
// taller; collapsed nodes count as leaves.
function makeSubtreeMetrics(model, sizes) {
  const memo = new Map()
  function height(node) {
    if (memo.has(node.id)) return memo.get(node.id)
    const children = node.collapsed ? [] : childrenOf(model, node.id)
    let value = sizes[node.id].h
    if (children.length) value = Math.max(value, band(children))
    memo.set(node.id, value)
    return value
  }
  function band(children) {
    const total = children.reduce((sum, child) => sum + height(child), 0)
    return total + (children.length - 1) * V_GAP
  }
  return { height, band }
}

// Root centred at the origin; first-level branches split left/right (alternating
// by order for a deterministic, roughly balanced split), each side mirrored.
function placeRoot(model, root, sizes, metrics, positions) {
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

  placeSide(model, right, rootSize.w / 2 + H_GAP, 1, sizes, metrics, positions)
  placeSide(model, left, -rootSize.w / 2 - H_GAP, -1, sizes, metrics, positions)
}

// Stack a side's branch subtrees, vertically centred on the root (y=0).
function placeSide(model, branches, attachX, dir, sizes, metrics, positions) {
  if (!branches.length) return
  let top = -metrics.band(branches) / 2
  for (const branch of branches) {
    const height = metrics.height(branch)
    place(model, branch, attachX, top + height / 2, dir, sizes, metrics, positions)
    top += height + V_GAP
  }
}

// Position one node (its edge nearest the root at `attachX`), then recurse to its
// children one column further out in direction `dir` (+1 right, -1 left).
function place(model, node, attachX, centerY, dir, sizes, metrics, positions) {
  const size = sizes[node.id]
  const x = dir > 0 ? attachX : attachX - size.w
  positions[node.id] = { x, y: centerY - size.h / 2, ...size }

  const children = node.collapsed ? [] : childrenOf(model, node.id)
  if (!children.length) return
  const childAttachX = dir > 0 ? x + size.w + H_GAP : x - H_GAP
  let top = centerY - metrics.band(children) / 2
  for (const child of children) {
    const height = metrics.height(child)
    place(model, child, childAttachX, top + height / 2, dir, sizes, metrics, positions)
    top += height + V_GAP
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
  const midX = (start.x + end.x) / 2
  return `M ${start.x} ${start.y} C ${midX} ${start.y} ${midX} ${end.y} ${end.x} ${end.y}`
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
