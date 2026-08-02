import { describe, it, expect } from 'vitest'
import { mindmapModelFromShapes, flowchartModelFromShapes } from './freeFloatingGraph.js'
import { flattenSubmodels } from './freeFloating.js'
import { createMindMap, addChild, addCrosslink } from './mindmapModel.js'
import { createFlowchart, addFlowchartNode, addFlowchartEdge } from './flowchartModel.js'

// The adapter must invert the migration: flatten a sub-model into tagged shapes +
// connectors, reconstruct a model from them, and get the same tree/graph back.
function docWith(partial) {
  return {
    schemaVersion: 2, diagramType: 'unified',
    canvas: { width: 1920, height: 1080, background: null },
    shapes: [], connectors: [], sections: [],
    mindmap: null, flowchart: null, whiteboard: null,
    ...partial,
  }
}

describe('mindmapModelFromShapes', () => {
  it('round-trips a mind map through flatten → reconstruct', () => {
    const model = createMindMap('Root')
    const a = addChild(model, model.rootId, 'Alpha', 'right')
    const b = addChild(model, model.rootId, 'Beta', 'left')
    const grand = addChild(model, a, 'Gamma')
    const out = flattenSubmodels(docWith({ mindmap: model }))

    const rebuilt = mindmapModelFromShapes(out.shapes, out.connectors)
    expect(rebuilt.rootId).toBe(model.rootId)
    expect(rebuilt.nodes.map((n) => n.id).sort()).toEqual([model.rootId, a, b, grand].sort())
    // Tree structure is preserved via the mindmap.parentId tag.
    const byId = Object.fromEntries(rebuilt.nodes.map((n) => [n.id, n]))
    expect(byId[a].parentId).toBe(model.rootId)
    expect(byId[grand].parentId).toBe(a)
    expect(byId[model.rootId].parentId).toBeNull()
    expect(byId[a].text).toBe('Alpha')
  })

  it('recovers cross-links from mindmap-crosslink connectors', () => {
    const model = createMindMap('Root')
    const a = addChild(model, model.rootId, 'Alpha')
    const b = addChild(model, model.rootId, 'Beta')
    addCrosslink(model, a, b, 'relates to')
    const out = flattenSubmodels(docWith({ mindmap: model }))

    const rebuilt = mindmapModelFromShapes(out.shapes, out.connectors)
    expect(rebuilt.crosslinks).toHaveLength(1)
    expect(rebuilt.crosslinks[0]).toMatchObject({ fromId: a, toId: b, label: 'relates to' })
  })

  it('ignores non-mindmap shapes', () => {
    const model = createMindMap('Root')
    const out = flattenSubmodels(docWith({ mindmap: model }))
    out.shapes.push({ id: 'block1', type: 'rectangle', x: 0, y: 0, w: 10, h: 10 })
    expect(mindmapModelFromShapes(out.shapes).nodes).toHaveLength(1)
  })
})

describe('flowchartModelFromShapes', () => {
  it('round-trips a flowchart through flatten → reconstruct', () => {
    const model = createFlowchart('TB')
    const start = addFlowchartNode(model, 'terminator', 'Start', 40, 40)
    const dec = addFlowchartNode(model, 'decision', 'OK?', 40, 200)
    addFlowchartEdge(model, start, dec)
    addFlowchartEdge(model, dec, start, { fromPort: 'yes', label: 'Yes' })
    const out = flattenSubmodels(docWith({ flowchart: model }))

    const rebuilt = flowchartModelFromShapes(out.shapes, out.connectors)
    expect(rebuilt.nodes.map((n) => n.id).sort()).toEqual([start, dec].sort())
    const decNode = rebuilt.nodes.find((n) => n.id === dec)
    expect(decNode.nodeType).toBe('decision')
    expect(decNode.text).toBe('OK?')
    // Decision branch ports survive.
    expect(decNode.branches.map((b) => b.port)).toEqual(expect.arrayContaining(['yes', 'no']))
    // Edges recover their endpoint nodes and the branch port + kind.
    expect(rebuilt.edges).toHaveLength(2)
    const branch = rebuilt.edges.find((e) => e.from.nodeId === dec)
    expect(branch.from.port).toBe('yes')
    expect(branch.to.nodeId).toBe(start)
    expect(branch.kind).toBe('flow')
  })

  it('reads node geometry straight off the shapes (free positioning)', () => {
    const model = createFlowchart('TB')
    model.origin = { x: 600, y: 700 }
    const n = addFlowchartNode(model, 'process', 'Step', 30, 20)
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const rebuilt = flowchartModelFromShapes(out.shapes, out.connectors)
    const node = rebuilt.nodes.find((x) => x.id === n)
    // Position is the baked absolute canvas coord (node + origin), not the old local.
    expect(node.x).toBe(30 + 600)
    expect(node.y).toBe(20 + 700)
  })
})
