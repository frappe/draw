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
