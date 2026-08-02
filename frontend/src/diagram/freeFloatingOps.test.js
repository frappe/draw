import { describe, it, expect } from 'vitest'
import { buildMindmapChild, buildMindmapSibling, buildFlowchartChild } from './freeFloatingOps.js'
import { flattenSubmodels, ROLE } from './freeFloating.js'
import { createMindMap, addChild } from './mindmapModel.js'
import { createFlowchart, addFlowchartNode } from './flowchartModel.js'

// A migrated single-root mind map's shapes[] (root only), to grow from.
function rootShapes() {
  const model = createMindMap('Root')
  const doc = flattenSubmodels({
    schemaVersion: 2, diagramType: 'unified',
    canvas: { width: 1920, height: 1080, background: null },
    shapes: [], connectors: [], sections: [],
    mindmap: model, flowchart: null, whiteboard: null,
  })
  return { shapes: doc.shapes, connectors: doc.connectors, rootId: model.rootId }
}

describe('buildMindmapChild', () => {
  it('builds a tagged child shape + branch connector bound to the parent', () => {
    const { shapes, rootId } = rootShapes()
    const { shape, connector } = buildMindmapChild(shapes, rootId, 'ocean')
    expect(shape.role).toBe(ROLE.mindmapNode)
    expect(shape.mindmap.parentId).toBe(rootId)
    expect(shape.mindmap.isRoot).toBe(false)
    expect(shape.mindmap.depth).toBe(1)
    expect(shape.border.color).toMatch(/^#/)
    expect(connector.role).toBe(ROLE.mindmapBranch)
    expect(connector.from.shapeId).toBe(rootId)
    expect(connector.to.shapeId).toBe(shape.id)
  })

  it('places the first child to the right of the root, the second to the left', () => {
    let { shapes, rootId } = rootShapes()
    const root = shapes.find((s) => s.id === rootId)
    const first = buildMindmapChild(shapes, rootId, 'ocean')
    expect(first.shape.x).toBeGreaterThan(root.x) // right side
    expect(first.shape.mindmap.side).toBe('right')
    // With one child on the right, the next balances to the left.
    shapes = [...shapes, first.shape]
    const second = buildMindmapChild(shapes, rootId, 'ocean')
    expect(second.shape.x).toBeLessThan(root.x) // left side
    expect(second.shape.mindmap.side).toBe('left')
  })

  it('honours an explicit side', () => {
    const { shapes, rootId } = rootShapes()
    const { shape } = buildMindmapChild(shapes, rootId, 'ocean', 'left')
    expect(shape.mindmap.side).toBe('left')
  })

  it('returns null for a non-mind-map shape', () => {
    const { shapes } = rootShapes()
    shapes.push({ id: 'block1', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 })
    expect(buildMindmapChild(shapes, 'block1', 'ocean')).toBeNull()
  })
})

describe('buildMindmapSibling', () => {
  it('adds a sibling as another child of the same parent', () => {
    const model = createMindMap('Root')
    const a = addChild(model, model.rootId, 'Alpha', 'right')
    const doc = flattenSubmodels({
      schemaVersion: 2, diagramType: 'unified',
      canvas: { width: 1920, height: 1080, background: null },
      shapes: [], connectors: [], sections: [],
      mindmap: model, flowchart: null, whiteboard: null,
    })
    const { shape } = buildMindmapSibling(doc.shapes, a, 'ocean')
    expect(shape.mindmap.parentId).toBe(model.rootId) // sibling of a → child of root
  })

  it('grows the root with a child when it has no parent', () => {
    const { shapes, rootId } = rootShapes()
    const { shape } = buildMindmapSibling(shapes, rootId, 'ocean')
    expect(shape.mindmap.parentId).toBe(rootId)
  })
})

// A migrated single-node flowchart's shapes[]/connectors[], to grow from.
function flowchartShapes(nodeType = 'terminator') {
  const model = createFlowchart()
  const startId = addFlowchartNode(model, nodeType, 'Start', 100, 100)
  const doc = flattenSubmodels({
    schemaVersion: 2, diagramType: 'unified',
    canvas: { width: 1920, height: 1080, background: null },
    shapes: [], connectors: [], sections: [],
    mindmap: null, flowchart: model, whiteboard: null,
  })
  return { shapes: doc.shapes, connectors: doc.connectors, startId }
}

describe('buildFlowchartChild', () => {
  it('builds a tagged child shape + edge connector bound to the parent', () => {
    const { shapes, connectors, startId } = flowchartShapes()
    const { shape, connector } = buildFlowchartChild(shapes, connectors, startId, 'process')
    expect(shape.role).toBe(ROLE.flowchartNode)
    expect(shape.flowchart.nodeType).toBe('process')
    expect(connector.role).toBe(ROLE.flowchartEdge)
    expect(connector.from.shapeId).toBe(startId)
    expect(connector.to.shapeId).toBe(shape.id)
    expect(connector.flowchart.fromPort).toBe('out')
  })

  it('places the child one level down from the parent (TB)', () => {
    const { shapes, connectors, startId } = flowchartShapes()
    const parent = shapes.find((s) => s.id === startId)
    const { shape } = buildFlowchartChild(shapes, connectors, startId, 'process')
    expect(shape.y).toBeGreaterThan(parent.y)
  })

  it('extends a decision node through its free branches, carrying the labels', () => {
    const { shapes, connectors, startId } = flowchartShapes('decision')
    const first = buildFlowchartChild(shapes, connectors, startId, 'process')
    expect(first.connector.flowchart.fromPort).toBe('yes')
    expect(first.connector.label).toBe('Yes')
    // With Yes taken, the next child fills the No branch.
    const second = buildFlowchartChild(
      [...shapes, first.shape],
      [...connectors, first.connector],
      startId,
      'process',
    )
    expect(second.connector.flowchart.fromPort).toBe('no')
    expect(second.connector.label).toBe('No')
  })

  it('returns null for a non-flowchart shape', () => {
    const { shapes, connectors } = flowchartShapes()
    shapes.push({ id: 'block1', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 })
    expect(buildFlowchartChild(shapes, connectors, 'block1', 'process')).toBeNull()
  })
})
