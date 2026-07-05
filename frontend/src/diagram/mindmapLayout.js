// Balanced mind-map auto-layout — pure, O(n) (spec diagram-types A6, Part G7).
// layoutMindMap(model) returns { positions: { [id]: {x,y,w,h} }, bbox: {w,h} }
// with coordinates normalised so the content's top-left sits at (0,0), letting
// the canvas reuse its existing fit-to-view centring. Positions are derived,
// never stored (Part G6). Built simplest-correct: a one-sided placer, applied
// rightward and (mirrored) leftward, with the root centred between the sides.

import { childrenOf, nodeById, subtreeIds } from './mindmapModel.js'

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
  const lines = wrapLineCount(text, charWidth, width - PAD_X)
  const height = lines * lineHeight + PAD_Y
  return { w: Math.round(width), h: Math.round(height) }
}

// Greedy word-wrap line count at `textWidth` px: packs whole words per line, and
// breaks a single word too long to fit across lines. Approximates how the
// rendered wrapping <div> lays the same text out, so the measured box height
// leaves room for every line (no clipped text).
function wrapLineCount(text, charWidth, textWidth) {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  const perLine = Math.max(1, Math.floor(textWidth / charWidth))
  let lines = 1
  let col = 0
  for (const word of words) {
    if (word.length > perLine) {
      if (col > 0) lines++ // finish the current line before the long word
      lines += Math.ceil(word.length / perLine) - 1
      col = word.length % perLine || perLine
      continue
    }
    const need = col === 0 ? word.length : col + 1 + word.length
    if (need <= perLine) col = need
    else {
      lines++
      col = word.length
    }
  }
  return lines
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function layoutMindMap(model) {
  if (!model || !model.rootId) return { positions: {}, bbox: { w: 0, h: 0 } }
  const sizes = sizeNodes(model)
  const metrics = makeSubtreeMetrics(model, sizes)
  const positions = {}
  placeRoot(model, sizes, metrics, positions)
  return normalise(positions)
}

function sizeNodes(model) {
  const sizes = {}
  for (const node of model.nodes) {
    sizes[node.id] = measureNodeSize(node, node.id === model.rootId)
  }
  return sizes
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
function placeRoot(model, sizes, metrics, positions) {
  const rootSize = sizes[model.rootId]
  positions[model.rootId] = { x: -rootSize.w / 2, y: -rootSize.h / 2, ...rootSize }

  const branches = childrenOf(model, model.rootId)
  const right = branches.filter((_, index) => index % 2 === 0)
  const left = branches.filter((_, index) => index % 2 === 1)

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

// A smooth cubic-bezier path from a parent box edge to a child box edge, fanning
// horizontally (control points pulled toward each other on x). `side` is +1 when
// the child sits to the right of the parent, -1 to the left (spec A4 curves).
export function branchPath(parentBox, childBox) {
  const side = childBox.x >= parentBox.x ? 1 : -1
  const start = edgePoint(parentBox, side)
  const end = edgePoint(childBox, -side)
  const midX = (start.x + end.x) / 2
  return `M ${start.x} ${start.y} C ${midX} ${start.y} ${midX} ${end.y} ${end.x} ${end.y}`
}

// The middle of a box's left (side<0) or right (side>0) edge.
function edgePoint(box, side) {
  return { x: side > 0 ? box.x + box.w : box.x, y: box.y + box.h / 2 }
}

// Shift all positions so the content's top-left is at (0,0) plus a margin, and
// report the bounding-box size for fit-to-view.
function normalise(positions) {
  const boxes = Object.values(positions)
  if (!boxes.length) return { positions, bbox: { w: 0, h: 0 } }
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  const shifted = {}
  for (const [id, box] of Object.entries(positions)) {
    shifted[id] = { ...box, x: box.x - minX + PAD, y: box.y - minY + PAD }
  }
  return { positions: shifted, bbox: { w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 } }
}
