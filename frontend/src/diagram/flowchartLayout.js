// Flowchart geometry + layout — pure helpers (spec diagram-types Part B6/B7,
// Part G7/G8). This module owns:
//   - node port points (logical attach points per direction TB/LR),
//   - orthogonal (elbow) edge routing with slight offsets for overlapping runs,
//   - auto-placement of a newly created node one level down a column/lane,
//   - "Tidy up" full re-flow (clears manuallyPositioned),
//   - flow-direction toggle re-layout,
//   - content bounds for fit-to-view / thumbnail / export (one render path, G8).
// All coordinates are logical canvas units (Part G4). Positions live on the
// model (manual placement allowed); these functions read sizes via nodeSize.

import {
  nodeSize,
  flowchartNodeById,
  outgoingEdges,
  incomingEdges,
} from './flowchartModel.js'

const PAD = 60 // content-bounds margin
const LEVEL_GAP = 90 // gap between successive levels (down in TB, right in LR)
const SIBLING_GAP = 48 // gap between siblings within a level
const ROUTE_OFFSET = 14 // lateral offset to separate overlapping parallel runs

// ----- node ports ----------------------------------------------------------

// Center of a node box.
export function nodeCenter(node) {
  const size = nodeSize(node)
  return { x: node.x + size.w / 2, y: node.y + size.h / 2 }
}

// Logical point of a named port on a node, accounting for flow direction.
// Decision branch ports (anything not 'in'/'out') fan out along the node's
// downstream edge so each branch leaves from a distinct point.
export function portPoint(node, port, direction, branchInfo) {
  const size = nodeSize(node)
  const c = nodeCenter(node)
  const incoming = port === 'in'
  if (direction === 'LR') {
    const x = incoming ? node.x : node.x + size.w
    if (branchInfo) return { x, y: spread(node.y, size.h, branchInfo) }
    return { x, y: c.y }
  }
  const y = incoming ? node.y : node.y + size.h
  if (branchInfo) return { x: spread(node.x, size.w, branchInfo), y }
  return { x: c.x, y }
}

// Even spread of N branch ports across a node's outgoing edge.
function spread(origin, span, { index, count }) {
  const step = span / (count + 1)
  return origin + step * (index + 1)
}

// Resolve a branch port's spread info (index/count) for a decision node, or
// null for a plain single-out port.
export function branchInfoFor(node, port) {
  if (node.nodeType !== 'decision' || port === 'out' || port === 'in') return null
  const index = node.branches.findIndex((branch) => branch.port === port)
  if (index < 0) return null
  return { index, count: node.branches.length }
}

// ----- orthogonal routing ---------------------------------------------------

// Compute an elbow polyline (array of points) for one edge, re-routing as the
// nodes move (the points are derived from current node positions every render).
// `offsetIndex` nudges parallel runs sideways so overlapping routes separate
// (spec B6, no obstacle-avoidance). Returns { points, midpoint, end, angle }.
export function routeEdge(model, edge, offsetIndex = 0) {
  const fromNode = flowchartNodeById(model, edge.from.nodeId)
  const toNode = flowchartNodeById(model, edge.to.nodeId)
  if (!fromNode || !toNode) return null
  const direction = model.direction || 'TB'
  const start = portPoint(fromNode, edge.from.port, direction, branchInfoFor(fromNode, edge.from.port))
  const end = portPoint(toNode, edge.to.port, direction, branchInfoFor(toNode, edge.to.port))
  const points = elbowPoints(start, end, direction, offsetIndex)
  return {
    points,
    midpoint: midpointOf(points),
    end,
    angle: arrowAngle(points),
  }
}

// Build the elbow: leave the source port along the flow axis, turn once at the
// mid level, then arrive at the target port. A small per-run offset shifts the
// turn line so parallel edges don't perfectly overlap.
function elbowPoints(start, end, direction, offsetIndex) {
  const shift = offsetIndex * ROUTE_OFFSET
  if (direction === 'LR') {
    const midX = (start.x + end.x) / 2 + shift
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
  }
  const midY = (start.y + end.y) / 2 + shift
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
}

// SVG path data for a polyline.
export function pointsToPath(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

function midpointOf(points) {
  // Midpoint of the longest interior segment reads best for a label pill.
  let best = { length: -1, point: points[0] }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length > best.length) best = { length, point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }
  return best.point
}

// Arrowhead angle (degrees) from the last segment of the route.
function arrowAngle(points) {
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

// Assign each edge a small offset index so that edges sharing the same
// source-port turn line are nudged apart. Returns { [edgeId]: offsetIndex }.
export function routeOffsets(model) {
  const groups = new Map()
  for (const edge of model.edges) {
    const key = `${edge.from.nodeId}:${edge.to.nodeId}`
    const list = groups.get(key) || []
    list.push(edge.id)
    groups.set(key, list)
  }
  const offsets = {}
  for (const list of groups.values()) {
    list.forEach((id, index) => {
      offsets[id] = index - (list.length - 1) / 2 // centre the spread around 0
    })
  }
  return offsets
}

// ----- auto-placement --------------------------------------------------------

// Position a newly created child node one level down from its parent, snapped to
// the parent's column/lane and offset to make room for existing children
// (spec B4 auto-position, B7 column/lane snapping). For a decision branch the
// child is fanned out laterally so branches auto-balance symmetrically (B4/F3).
// Returns { x, y } for the new node; the caller writes it onto the model.
export function placeChild(model, parentId, childNode, branchIndex = null, branchCount = 1) {
  const parent = flowchartNodeById(model, parentId)
  if (!parent) return { x: childNode.x, y: childNode.y }
  const direction = model.direction || 'TB'
  const parentSize = nodeSize(parent)
  const childSize = nodeSize(childNode)
  const parentCenter = nodeCenter(parent)
  const lane = laneOffset(branchIndex, branchCount, childSize, direction)
  if (direction === 'LR') {
    return {
      x: parent.x + parentSize.w + LEVEL_GAP,
      y: Math.round(parentCenter.y - childSize.h / 2 + lane),
    }
  }
  return {
    x: Math.round(parentCenter.x - childSize.w / 2 + lane),
    y: parent.y + parentSize.h + LEVEL_GAP,
  }
}

// Symmetric lateral spread for branch children (0 for a single child).
function laneOffset(branchIndex, branchCount, childSize, direction) {
  if (branchIndex === null || branchCount <= 1) return 0
  const span = direction === 'LR' ? childSize.h : childSize.w
  const step = span + SIBLING_GAP
  return (branchIndex - (branchCount - 1) / 2) * step
}

// ----- Tidy up (full re-flow) ------------------------------------------------

// Re-flow the whole chart from its roots, assigning every node a clean
// column/lane position and clearing manuallyPositioned (spec B7/F5, Part G7).
// Mutates the model in place; run inside one commit() for a single undo unit.
export function tidyLayout(model) {
  const order = topoOrder(model)
  const levels = assignLevels(model, order)
  positionByLevels(model, levels)
  for (const node of model.nodes) node.manuallyPositioned = false
}

// Roots have no incoming flow edges; everything else follows them.
function rootIds(model) {
  return model.nodes
    .filter((node) => incomingEdges(model, node.id).length === 0)
    .map((node) => node.id)
}

// Breadth-first order from the roots so levels are well-defined even with cycles
// (a revisited node keeps its first, shallowest level).
function topoOrder(model) {
  const seen = new Set()
  const order = []
  const queue = [...rootIds(model)]
  if (!queue.length && model.nodes.length) queue.push(model.nodes[0].id)
  while (queue.length) {
    const id = queue.shift()
    if (seen.has(id)) continue
    seen.add(id)
    order.push(id)
    for (const edge of outgoingEdges(model, id)) queue.push(edge.to.nodeId)
  }
  // Append any disconnected nodes so every node gets placed.
  for (const node of model.nodes) if (!seen.has(node.id)) order.push(node.id)
  return order
}

// Level (depth) of each node = 1 + max parent level, defaulting roots to 0.
function assignLevels(model, order) {
  const level = {}
  for (const id of order) {
    const parents = incomingEdges(model, id).map((edge) => edge.from.nodeId)
    const parentLevels = parents.map((p) => level[p]).filter((value) => value !== undefined)
    level[id] = parentLevels.length ? Math.max(...parentLevels) + 1 : 0
  }
  return level
}

// Stack nodes per level along the cross axis, centred, advancing the main axis
// by each level's deepest box plus LEVEL_GAP.
function positionByLevels(model, levels) {
  const direction = model.direction || 'TB'
  const byLevel = groupByLevel(model, levels)
  let main = PAD
  for (const level of Object.keys(byLevel).map(Number).sort((a, b) => a - b)) {
    const nodes = byLevel[level]
    const sizes = nodes.map((node) => nodeSize(node))
    const crossTotal = crossSpan(sizes, direction)
    const deepest = Math.max(...sizes.map((s) => (direction === 'LR' ? s.w : s.h)))
    let cross = PAD - crossTotal / 2 + crossCenter(model, direction)
    nodes.forEach((node, index) => {
      placeAtLevel(node, sizes[index], main, cross, direction)
      cross += (direction === 'LR' ? sizes[index].h : sizes[index].w) + SIBLING_GAP
    })
    main += deepest + LEVEL_GAP
  }
}

function groupByLevel(model, levels) {
  const groups = {}
  for (const node of model.nodes) {
    const level = levels[node.id] ?? 0
    ;(groups[level] = groups[level] || []).push(node)
  }
  return groups
}

function crossSpan(sizes, direction) {
  const total = sizes.reduce((sum, s) => sum + (direction === 'LR' ? s.h : s.w), 0)
  return total + (sizes.length - 1) * SIBLING_GAP
}

// Keep the re-flow roughly where the chart already sits so it doesn't jump far.
function crossCenter(model, direction) {
  if (!model.nodes.length) return PAD
  const centers = model.nodes.map((node) => nodeCenter(node))
  const values = centers.map((c) => (direction === 'LR' ? c.y : c.x))
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function placeAtLevel(node, size, main, cross, direction) {
  if (direction === 'LR') {
    node.x = Math.round(main)
    node.y = Math.round(cross)
  } else {
    node.x = Math.round(cross)
    node.y = Math.round(main)
  }
}

// Re-flow that respects manual placement: recomputes clean level positions but
// only writes them onto nodes that are NOT manuallyPositioned, plus the given
// `forceIds` (a freshly inserted node, spec B7 insert-in-the-middle). Manual
// nodes stay put while the rest of the chart reflows around them (Part G7).
export function reflowAuto(model, forceIds = []) {
  const force = new Set(forceIds)
  const order = topoOrder(model)
  const levels = assignLevels(model, order)
  const target = {}
  collectLevelPositions(model, levels, target)
  for (const node of model.nodes) {
    if ((!node.manuallyPositioned || force.has(node.id)) && target[node.id]) {
      node.x = target[node.id].x
      node.y = target[node.id].y
    }
  }
}

// Compute (without writing) the clean level position for every node.
function collectLevelPositions(model, levels, out) {
  const snapshot = model.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }))
  positionByLevels(model, levels)
  for (const node of model.nodes) out[node.id] = { x: node.x, y: node.y }
  for (const saved of snapshot) {
    const node = flowchartNodeById(model, saved.id)
    node.x = saved.x
    node.y = saved.y
  }
}

// ----- direction toggle ------------------------------------------------------

// Flip TB<->LR and re-lay-out the whole chart (spec B7/F5). One undoable unit.
export function toggleDirection(model) {
  model.direction = model.direction === 'LR' ? 'TB' : 'LR'
  tidyLayout(model)
}

// ----- content bounds (fit/export, Part G8) ----------------------------------

// Bounding box over all node boxes, padded, or a sensible empty box.
export function flowchartContentBounds(model) {
  if (!model || !model.nodes.length) return { x: 0, y: 0, w: 200, h: 120 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of model.nodes) {
    const size = nodeSize(node)
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + size.w)
    maxY = Math.max(maxY, node.y + size.h)
  }
  return { x: minX - PAD, y: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 }
}
