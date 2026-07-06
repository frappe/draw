// Flowchart model — pure data + mutations (spec diagram-types Part B10).
// A flowchart is a set of typed nodes connected by orthogonal edges. Nodes carry
// an explicit x/y (manual placement is allowed, spec B7) plus a
// `manuallyPositioned` flag so auto-place/Tidy only move auto nodes (Part G7).
// IDs are stable (factories nextId), never array index (Part G2). Mutations
// operate in place and return the new/affected id so the store wraps them in
// commit() for undo (Part G6). Edge routing/geometry is derived in
// flowchartLayout.js, never stored here.

import { nextId } from './factories.js'

// Curated node-type set (spec B3). nodeType selects the SVG shape at render.
// The standard flowchart shape set (spec R4/P7): the six core shapes plus the
// common Document / Database / Predefined process / Manual input / Preparation /
// Off-page reference. The connector/junction (small circle) stays last.
export const NODE_TYPES = [
  'terminator',
  'process',
  'decision',
  'inputOutput',
  'document',
  'database',
  'predefinedProcess',
  'manualInput',
  'preparation',
  'offPageRef',
  'connector',
]

// Per-type metadata: the human label used in the picker and the default node
// box. The connector/junction is a small circle; the rest are wider blocks.
export const NODE_TYPE_META = {
  terminator: { label: 'Terminal', text: 'Start', w: 150, h: 60 },
  process: { label: 'Process', text: 'Process', w: 160, h: 72 },
  decision: { label: 'Decision', text: 'Decision?', w: 150, h: 96 },
  inputOutput: { label: 'Input / Output', text: 'Data', w: 160, h: 72 },
  document: { label: 'Document', text: 'Document', w: 160, h: 84 },
  database: { label: 'Database', text: 'Data', w: 120, h: 100 },
  predefinedProcess: { label: 'Predefined process', text: 'Subprocess', w: 172, h: 72 },
  manualInput: { label: 'Manual input', text: 'Input', w: 160, h: 76 },
  preparation: { label: 'Preparation', text: 'Prepare', w: 156, h: 80 },
  offPageRef: { label: 'Off-page reference', text: 'Off-page', w: 120, h: 88 },
  connector: { label: 'Junction', text: 'Junction', w: 72, h: 72 },
}

export function defaultNodeText(nodeType) {
  return NODE_TYPE_META[nodeType]?.text ?? ''
}

// Node box. Height grows to fit wrapped text (like block/mind-map nodes) so a
// long label wraps inside the shape instead of overflowing it.
const FC_CHAR_W = 7.6
const FC_LINE_H = 18
const FC_PAD_Y = 22
export function nodeSize(node) {
  const meta = NODE_TYPE_META[node.nodeType] || NODE_TYPE_META.process
  const w = node.w || meta.w
  const baseH = node.h || meta.h
  const text = node.text || ''
  if (!text || node.nodeType === 'connector') return { w, h: baseH }
  const inset = node.nodeType === 'decision' ? Math.round(w * 0.16) : 10
  const textW = Math.max(24, w - 2 * inset)
  const perLine = Math.max(1, Math.floor(textW / FC_CHAR_W))
  const lines = wrapLineCount(text, perLine)
  return { w, h: Math.max(baseH, lines * FC_LINE_H + FC_PAD_Y) }
}

// Greedy word-wrap line count at `perLine` chars (breaks over-long words).
function wrapLineCount(text, perLine) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  let lines = 1
  let col = 0
  for (const word of words) {
    if (word.length > perLine) {
      if (col > 0) lines++
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

export function makeFlowchartNode(nodeType, text, x, y) {
  const meta = NODE_TYPE_META[nodeType] || NODE_TYPE_META.process
  return {
    id: nextId('f'),
    nodeType,
    text,
    x,
    y,
    w: meta.w,
    h: meta.h,
    fill: null,
    border: null,
    manuallyPositioned: false,
    branches: nodeType === 'decision' ? defaultDecisionBranches() : [],
  }
}

// Decision nodes expose labelled outputs (default Yes / No, spec B4).
export function defaultDecisionBranches() {
  return [
    { port: 'yes', label: 'Yes' },
    { port: 'no', label: 'No' },
  ]
}

export function makeFlowchartEdge(fromNodeId, toNodeId, partial = {}) {
  return {
    id: nextId('fe'),
    from: { nodeId: fromNodeId, port: partial.fromPort || 'out' },
    to: { nodeId: toNodeId, port: partial.toPort || 'in' },
    label: partial.label || '',
    arrowheads: { start: false, end: true },
    routing: 'orthogonal',
    kind: partial.kind || 'flow',
  }
}

// Start empty — the user builds from scratch (double-click the canvas to drop
// the first node, then grow it with the + handles).
export function createFlowchart(direction = 'TB') {
  return { direction, nodes: [], edges: [] }
}

export function flowchartNodeById(model, id) {
  return model.nodes.find((node) => node.id === id)
}

export function flowchartEdgeById(model, id) {
  return model.edges.find((edge) => edge.id === id)
}

// Outgoing / incoming edges of a node.
export function outgoingEdges(model, nodeId) {
  return model.edges.filter((edge) => edge.from.nodeId === nodeId)
}

export function incomingEdges(model, nodeId) {
  return model.edges.filter((edge) => edge.to.nodeId === nodeId)
}

// Add a node; returns its id. Caller supplies position (auto-place lives in the
// layout module + interaction). A blank text means "use the type's default".
export function addFlowchartNode(model, nodeType, text = '', x = 0, y = 0) {
  const node = makeFlowchartNode(nodeType, text || defaultNodeText(nodeType), x, y)
  model.nodes.push(node)
  return node.id
}

// Connect two existing nodes; returns the edge id (or null if either is missing).
export function addFlowchartEdge(model, fromNodeId, toNodeId, partial = {}) {
  if (!flowchartNodeById(model, fromNodeId) || !flowchartNodeById(model, toNodeId)) return null
  const edge = makeFlowchartEdge(fromNodeId, toNodeId, partial)
  model.edges.push(edge)
  return edge.id
}

// Remove a node and any edges touching it (no dangling arrows, spec B11).
export function removeFlowchartNode(model, id) {
  model.nodes = model.nodes.filter((node) => node.id !== id)
  model.edges = model.edges.filter((edge) => edge.from.nodeId !== id && edge.to.nodeId !== id)
}

export function removeFlowchartEdge(model, id) {
  model.edges = model.edges.filter((edge) => edge.id !== id)
}

// Swap a node's type in place, preserving its edges (spec B7/B11). Switching to
// or from a decision adjusts the branch set + re-homes any branch-anchored
// outgoing edges so labels/ports stay valid. The node id never changes, so
// every edge endpoint keeps pointing at it.
export function swapNodeType(model, id, nodeType) {
  const node = flowchartNodeById(model, id)
  if (!node || !NODE_TYPES.includes(nodeType) || node.nodeType === nodeType) return
  const wasDecision = node.nodeType === 'decision'
  node.nodeType = nodeType
  const meta = NODE_TYPE_META[nodeType]
  // Reset to the new type's default box unless the user hand-sized it; keeping
  // it simple, we always adopt the type's box (matches the picker defaults).
  node.w = meta.w
  node.h = meta.h
  if (nodeType === 'decision') {
    if (!wasDecision) node.branches = defaultDecisionBranches()
  } else if (wasDecision) {
    collapseDecisionBranches(model, node)
  }
}

// Leaving the decision type: drop branch ports, re-home outgoing edges onto the
// single 'out' port so they keep their target (labels are cleared as they no
// longer name a branch).
function collapseDecisionBranches(model, node) {
  node.branches = []
  for (const edge of outgoingEdges(model, node.id)) {
    edge.from.port = 'out'
  }
}

// Add a labelled branch output to a decision node; returns the new port name.
export function addDecisionBranch(model, id, label = 'Option') {
  const node = flowchartNodeById(model, id)
  if (!node || node.nodeType !== 'decision') return null
  const port = nextId('b')
  node.branches.push({ port, label })
  return port
}

export function removeDecisionBranch(model, id, port) {
  const node = flowchartNodeById(model, id)
  if (!node || node.nodeType !== 'decision') return
  node.branches = node.branches.filter((branch) => branch.port !== port)
  // Any edge on that branch loses its anchor; remove it (no dangling routes).
  model.edges = model.edges.filter(
    (edge) => !(edge.from.nodeId === id && edge.from.port === port),
  )
}

// ----- auto-numbering (spec 14.4) --------------------------------------------
// A leading "N. " step number on a node's label.
const STEP_PREFIX = /^\s*\d+\.\s+/

export function stripStepNumber(text) {
  return (text || '').replace(STEP_PREFIX, '')
}

// Nodes in flow order: a breadth-first walk from the entry node(s) (no incoming
// edge) following outgoing edges, with position (top→bottom, left→right) as the
// tie-breaker. Any node not reached by the walk (cycles / islands) is appended
// in reading order, so every node is covered exactly once.
export function orderedFlowNodes(model) {
  const byPos = (a, b) => a.y - b.y || a.x - b.x
  const indeg = new Map(model.nodes.map((n) => [n.id, 0]))
  for (const edge of model.edges) {
    if (indeg.has(edge.to.nodeId)) indeg.set(edge.to.nodeId, indeg.get(edge.to.nodeId) + 1)
  }
  const roots = model.nodes.filter((n) => indeg.get(n.id) === 0).sort(byPos)
  const queue = (roots.length ? roots : [...model.nodes].sort(byPos)).slice()
  const visited = new Set()
  const out = []
  while (queue.length) {
    const node = queue.shift()
    if (visited.has(node.id)) continue
    visited.add(node.id)
    out.push(node)
    const next = outgoingEdges(model, node.id)
      .map((e) => flowchartNodeById(model, e.to.nodeId))
      .filter((n) => n && !visited.has(n.id))
      .sort(byPos)
    queue.push(...next)
  }
  for (const node of [...model.nodes].sort(byPos)) {
    if (!visited.has(node.id)) out.push(node)
  }
  return out
}

// True when every labelled, non-junction node already carries a step number.
export function isFlowNumbered(model) {
  const eligible = model.nodes.filter((n) => n.nodeType !== 'connector' && (n.text || '').trim())
  return eligible.length > 0 && eligible.every((n) => STEP_PREFIX.test(n.text || ''))
}

// Toggle sequential "1. / 2. / …" prefixes on the flow's nodes (junctions are
// skipped). Re-running strips them, so the palette button reads as a toggle.
export function autoNumberFlow(model) {
  if (isFlowNumbered(model)) {
    for (const node of model.nodes) {
      if (node.nodeType !== 'connector') node.text = stripStepNumber(node.text)
    }
    return
  }
  let step = 0
  for (const node of orderedFlowNodes(model)) {
    if (node.nodeType === 'connector') continue
    step += 1
    node.text = `${step}. ${stripStepNumber(node.text)}`
  }
}

// Insert a new node in the middle of an edge (spec B7 insert-in-the-middle).
// The original edge A->B is rewired to A->new, and a fresh new->B edge is added,
// preserving the original edge's branch label on the A->new half. Returns the
// new node id. Downstream re-flow is run by the caller (one undoable unit).
export function spliceNodeOnEdge(model, edgeId, nodeType, x = 0, y = 0) {
  const edge = flowchartEdgeById(model, edgeId)
  if (!edge) return null
  const newId = addFlowchartNode(model, nodeType, '', x, y)
  const downstream = edge.to.nodeId
  const downstreamPort = edge.to.port
  edge.to = { nodeId: newId, port: 'in' }
  addFlowchartEdge(model, newId, downstream, { toPort: downstreamPort })
  return newId
}
