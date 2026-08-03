// Reconstruct a mind-map / flowchart sub-model VIEW from the role-tagged shapes +
// connectors that the free-floating migration (freeFloating.js) produced. This is
// the inverse of the flatten: it lets every phase-3 interaction op reuse the
// existing, battle-tested pure model logic (mindmapModel/mindmapColors/
// mindmapLayout, flowchartModel/flowchartLayout) instead of reimplementing tree /
// graph mutation over the shared arrays.
//
// Node ids survive the migration verbatim (freeFloating.js reuses them as shape
// ids), so a reconstructed model refers to nodes by the SAME ids the shapes carry
// — a caller can mutate the model, then sync the result back to the shape/connector
// with that id. The reconstruction is READ-ONLY: it never mutates the inputs.

import { ROLE } from './freeFloating.js'

// Rebuild a mind-map model ({ rootId, nodes, crosslinks, layout }) from the tagged
// shapes. Tree structure comes from each shape's `mindmap.parentId` (authoritative),
// not the branch connectors — a branch connector is the visual edge, the tag is the
// data. Cross-links are recovered from the mindmap-crosslink connectors.
export function mindmapModelFromShapes(shapes, connectors = []) {
  const nodes = (shapes || [])
    .filter((shape) => shape.role === ROLE.mindmapNode)
    .map((shape) => ({
      id: shape.id,
      parentId: shape.mindmap?.parentId ?? null,
      text: shape.text?.content ?? '',
      order: shape.mindmap?.order ?? 0,
      depth: shape.mindmap?.depth ?? 0,
      collapsed: !!shape.mindmap?.collapsed,
      side: shape.mindmap?.side ?? null,
      color: shape.mindmap?.color ?? null,
      marker: shape.mindmap?.marker ?? { icon: null, colorDot: null },
    }))
  const roots = nodes.filter((node) => !node.parentId).sort((a, b) => a.order - b.order)
  const crosslinks = (connectors || [])
    .filter((connector) => connector.role === ROLE.mindmapCrosslink)
    .map((connector) => ({
      id: connector.mindmap?.crosslinkId ?? connector.id,
      fromId: connector.from?.shapeId,
      toId: connector.to?.shapeId,
      label: connector.label ?? '',
    }))
  return { rootId: roots[0]?.id ?? null, nodes, crosslinks, layout: 'balanced' }
}

// Rebuild a flowchart model ({ direction, nodes, edges }) from the tagged shapes +
// flowchart-edge connectors. Node geometry (x/y/w/h) is read straight off the
// shape, since flowchart nodes are freely positioned; edge endpoints/ports/kind
// come from the connector's flowchart tag.
export function flowchartModelFromShapes(shapes, connectors = [], direction = 'TB') {
  const nodes = (shapes || [])
    .filter((shape) => shape.role === ROLE.flowchartNode)
    .map((shape) => ({
      id: shape.id,
      nodeType: shape.flowchart?.nodeType ?? 'process',
      text: shape.text?.content ?? '',
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      fill: shape.fill ?? null,
      border: shape.border?.color ?? null,
      manuallyPositioned: !!shape.flowchart?.manuallyPositioned,
      branches: shape.flowchart?.branches ? shape.flowchart.branches.map((b) => ({ ...b })) : [],
    }))
  const edges = (connectors || [])
    .filter((connector) => connector.role === ROLE.flowchartEdge)
    .map((connector) => ({
      id: connector.flowchart?.edgeId ?? connector.id,
      from: { nodeId: connector.from?.shapeId, port: connector.flowchart?.fromPort ?? 'out' },
      to: { nodeId: connector.to?.shapeId, port: connector.flowchart?.toPort ?? 'in' },
      label: connector.label ?? '',
      arrowheads: { start: false, end: true },
      routing: 'orthogonal',
      kind: connector.flowchart?.kind ?? 'flow',
    }))
  return { direction, nodes, edges }
}

// The connected component (set of flowchart-node shape ids) reachable from `rootId`
// by walking flowchart-edge connectors UNDIRECTED. The canvas can hold several
// independent flowcharts at once (#167); a whole-graph layout action must touch only
// the chart the selected node belongs to, so callers scope the reconstructed model to
// this set. Returns an empty Set when rootId is missing or is not a flowchart node.
// With a single chart the walk reaches every flowchart node, so scoping is a no-op.
export function flowchartComponentIds(shapes, connectors = [], rootId = null) {
  const nodeIds = new Set(
    (shapes || []).filter((shape) => shape.role === ROLE.flowchartNode).map((shape) => shape.id),
  )
  if (!rootId || !nodeIds.has(rootId)) return new Set()

  // Undirected adjacency, edges between two flowchart nodes only (a dangling edge to a
  // deleted / non-flowchart shape can't bridge two charts).
  const neighbours = new Map()
  const link = (a, b) => neighbours.set(a, [...(neighbours.get(a) || []), b])
  for (const connector of connectors || []) {
    if (connector.role !== ROLE.flowchartEdge) continue
    const a = connector.from?.shapeId
    const b = connector.to?.shapeId
    if (!nodeIds.has(a) || !nodeIds.has(b)) continue
    link(a, b)
    link(b, a)
  }

  const seen = new Set([rootId])
  const stack = [rootId]
  while (stack.length) {
    const current = stack.pop()
    for (const next of neighbours.get(current) || []) {
      if (seen.has(next)) continue
      seen.add(next)
      stack.push(next)
    }
  }
  return seen
}

// The whole tree (set of mindmap-node shape ids) that `rootId` belongs to. Unlike a
// flowchart's undirected edge walk, a mind map's structure is authoritative in each
// node's `mindmap.parentId` tag (freeFloatingOps.buildMindmapChild), so the branch
// connectors are not needed here: climb parentId to the tree's true root, then collect
// that root's entire subtree by resolving children through parentId. The canvas can
// hold several independent mind maps at once (#48); a whole-tree Tidy must touch only
// the tree the selected node belongs to, so callers scope the reconstructed model to
// this set. Returns an empty Set when rootId is missing or is not a mindmap node.
// Guards against a parentId cycle (a malformed doc) so the climb and the collect halt.
export function mindmapComponentIds(shapes, rootId = null) {
  const nodes = new Map(
    (shapes || []).filter((shape) => shape.role === ROLE.mindmapNode).map((shape) => [shape.id, shape]),
  )
  if (!rootId || !nodes.has(rootId)) return new Set()

  // Climb parentId to the tree root, stopping on a missing parent or a cycle.
  let treeRoot = rootId
  const climbed = new Set([treeRoot])
  while (true) {
    const parentId = nodes.get(treeRoot)?.mindmap?.parentId
    if (!parentId || !nodes.has(parentId) || climbed.has(parentId)) break
    treeRoot = parentId
    climbed.add(parentId)
  }

  // Collect the root's whole subtree, resolving children through parentId. The
  // members guard doubles as the cycle guard for a malformed parentId chain.
  const members = new Set([treeRoot])
  const stack = [treeRoot]
  while (stack.length) {
    const current = stack.pop()
    for (const [id, shape] of nodes) {
      if (members.has(id)) continue
      if (shape.mindmap?.parentId === current) {
        members.add(id)
        stack.push(id)
      }
    }
  }
  return members
}
