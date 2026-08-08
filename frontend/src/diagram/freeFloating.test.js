import { describe, it, expect } from 'vitest'
import {
  flattenSubmodels,
  isMindmapShape,
  isFlowchartShape,
  mindmapNodeClickAction,
  ROLE,
  SCHEMA_VERSION_FREEFLOATING,
} from './freeFloating.js'
import { createMindMap, addChild, addCrosslink } from './mindmapModel.js'
import { layoutMindMap, offsetPositions } from './mindmapLayout.js'
import { createFlowchart, addFlowchartNode, addFlowchartEdge } from './flowchartModel.js'

// A minimal document envelope around a sub-model, mirroring createDiagramDocument.
function docWith(partial) {
  return {
    schemaVersion: 1,
    diagramType: 'unified',
    canvas: { width: 1920, height: 1080, background: null },
    shapes: [],
    connectors: [],
    sections: [],
    mindmap: null,
    flowchart: null,
    whiteboard: null,
    ...partial,
  }
}

// A three-node map: root → two children (left/right branches).
function sampleMindmap(origin = { x: 0, y: 0 }) {
  const model = createMindMap('Root')
  model.origin = { ...origin }
  const a = addChild(model, model.rootId, 'Alpha', 'right')
  const b = addChild(model, model.rootId, 'Beta', 'left')
  return { model, a, b }
}

describe('flattenSubmodels — mind map', () => {
  it('turns every node into a tagged shape, reusing the node id', () => {
    const { model, a, b } = sampleMindmap()
    const out = flattenSubmodels(docWith({ mindmap: model }))
    const mmShapes = out.shapes.filter(isMindmapShape)
    expect(mmShapes).toHaveLength(3)
    const ids = mmShapes.map((s) => s.id).sort()
    expect(ids).toEqual([model.rootId, a, b].sort())
    const root = out.shapes.find((s) => s.id === model.rootId)
    expect(root.role).toBe(ROLE.mindmapNode)
    expect(root.mindmap.isRoot).toBe(true)
    expect(root.text.content).toBe('Root')
  })

  it('boxes every node with the monochrome default look (#260 reverses #125)', () => {
    const { model, a, b } = sampleMindmap()
    const out = flattenSubmodels(docWith({ mindmap: model }))
    expect(out.shapes.find((s) => s.id === model.rootId).mindmap.shaped).toBe(true)
    for (const child of [a, b]) {
      const shape = out.shapes.find((s) => s.id === child)
      expect(shape.mindmap.shaped).toBe(true)
      expect(shape.fill).toBe('#F3F3F3') // NODE_GRAY fill
      expect(shape.border.color).toBe('#C7C7C7') // NODE_GRAY border
    }
  })

  it('bakes absolute canvas positions (layout shifted by the frame origin)', () => {
    const origin = { x: 600, y: 200 }
    const { model } = sampleMindmap(origin)
    const expanded = { ...model, nodes: model.nodes.map((n) => ({ ...n, collapsed: false })) }
    const expected = offsetPositions(layoutMindMap(expanded).positions, origin)
    const out = flattenSubmodels(docWith({ mindmap: model }))
    const root = out.shapes.find((s) => s.id === model.rootId)
    expect(root.x).toBe(Math.round(expected[model.rootId].x))
    expect(root.y).toBe(Math.round(expected[model.rootId].y))
    // With a non-zero origin nothing may sit at the untouched (0,0) default.
    expect(out.shapes.some((s) => s.x !== 0 || s.y !== 0)).toBe(true)
  })

  it('turns parent→child edges into connectors bound to both shapes', () => {
    const { model, a, b } = sampleMindmap()
    const out = flattenSubmodels(docWith({ mindmap: model }))
    const branches = out.connectors.filter((c) => c.role === ROLE.mindmapBranch)
    expect(branches).toHaveLength(2)
    for (const child of [a, b]) {
      const edge = branches.find((c) => c.to.shapeId === child)
      expect(edge.from.shapeId).toBe(model.rootId)
      expect(edge.from.anchor).toBeTruthy()
      expect(edge.to.anchor).toBeTruthy()
    }
  })

  it('anchors each branch on the side its child sits (layout-driven)', () => {
    const { model, a, b } = sampleMindmap()
    const out = flattenSubmodels(docWith({ mindmap: model }))
    const boxes = offsetPositions(
      layoutMindMap({ ...model, nodes: model.nodes.map((n) => ({ ...n, collapsed: false })) })
        .positions,
      model.origin,
    )
    for (const child of [a, b]) {
      const edge = out.connectors.find((c) => c.role === ROLE.mindmapBranch && c.to.shapeId === child)
      const childRight = boxes[child].x + boxes[child].w / 2 >= boxes[model.rootId].x + boxes[model.rootId].w / 2
      expect(edge.from.anchor).toBe(childRight ? 'right' : 'left')
    }
  })

  it('turns cross-links into dashed labelled connectors', () => {
    const { model, a, b } = sampleMindmap()
    addCrosslink(model, a, b, 'relates to')
    const out = flattenSubmodels(docWith({ mindmap: model }))
    const links = out.connectors.filter((c) => c.role === ROLE.mindmapCrosslink)
    expect(links).toHaveLength(1)
    expect(links[0].style.dash).toBe('dashed')
    expect(links[0].label).toBe('relates to')
    expect(links[0].from.shapeId).toBe(a)
    expect(links[0].to.shapeId).toBe(b)
  })

  it('lays out collapsed subtrees fully so no nodes migrate stacked', () => {
    const { model, a } = sampleMindmap()
    const grand = addChild(model, a, 'Gamma')
    const alpha = model.nodes.find((n) => n.id === a)
    alpha.collapsed = true // hide Gamma in the framed model
    const out = flattenSubmodels(docWith({ mindmap: model }))
    const gammaShape = out.shapes.find((s) => s.id === grand)
    const alphaShape = out.shapes.find((s) => s.id === a)
    // Gamma still gets its own real position, not stacked on its parent.
    expect(gammaShape.x !== alphaShape.x || gammaShape.y !== alphaShape.y).toBe(true)
    // …and the original collapsed flag survives in the tag for a future fold.
    expect(alphaShape.mindmap.collapsed).toBe(true)
  })
})

describe('flattenSubmodels — flowchart', () => {
  function sampleFlowchart(origin = { x: 0, y: 0 }) {
    const model = createFlowchart('TB')
    model.origin = { ...origin }
    const start = addFlowchartNode(model, 'terminator', 'Start', 40, 40)
    const dec = addFlowchartNode(model, 'decision', 'OK?', 40, 200)
    addFlowchartEdge(model, start, dec)
    const yes = addFlowchartEdge(model, dec, start, { fromPort: 'yes', label: 'Yes' })
    return { model, start, dec, yes }
  }

  it('turns every node into a tagged shape keeping its type and id', () => {
    const { model, start, dec } = sampleFlowchart()
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const fcShapes = out.shapes.filter(isFlowchartShape)
    expect(fcShapes.map((s) => s.id).sort()).toEqual([start, dec].sort())
    const decision = out.shapes.find((s) => s.id === dec)
    expect(decision.flowchart.nodeType).toBe('decision')
    expect(decision.text.content).toBe('OK?')
  })

  it('shifts node positions by the frame origin', () => {
    const { model, start } = sampleFlowchart({ x: 600, y: 700 })
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const startShape = out.shapes.find((s) => s.id === start)
    expect(startShape.x).toBe(40 + 600)
    expect(startShape.y).toBe(40 + 700)
  })

  it('preserves decision branches on the node tag', () => {
    const { model, dec } = sampleFlowchart()
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const decision = out.shapes.find((s) => s.id === dec)
    expect(decision.flowchart.branches.map((b) => b.port)).toContain('yes')
    expect(decision.flowchart.branches.map((b) => b.port)).toContain('no')
  })

  it('turns edges into connectors preserving port, kind and label', () => {
    const { model, dec, start } = sampleFlowchart()
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const edges = out.connectors.filter((c) => c.role === ROLE.flowchartEdge)
    expect(edges).toHaveLength(2)
    const branch = edges.find((c) => c.from.shapeId === dec)
    expect(branch.flowchart.fromPort).toBe('yes')
    expect(branch.label).toBe('Yes')
    expect(branch.to.shapeId).toBe(start)
  })

  it('drops edges whose endpoints are missing (no dangling routes)', () => {
    const model = createFlowchart('TB')
    const start = addFlowchartNode(model, 'process', 'A', 0, 0)
    const end = addFlowchartNode(model, 'process', 'B', 0, 200)
    addFlowchartEdge(model, start, end)
    // Forge a dangling edge whose target no longer exists.
    model.edges.push({
      id: 'ghost',
      from: { nodeId: start, port: 'out' },
      to: { nodeId: 'gone', port: 'in' },
      label: '',
    })
    const out = flattenSubmodels(docWith({ flowchart: model }))
    expect(out.connectors.filter((c) => c.role === ROLE.flowchartEdge)).toHaveLength(1)
  })
})

describe('flattenSubmodels — document level', () => {
  it('drops the sub-models after flattening', () => {
    const { model } = sampleMindmap()
    const out = flattenSubmodels(docWith({ mindmap: model }))
    expect(out.mindmap).toBeNull()
    expect(out.flowchart).toBeNull()
  })

  it('never mutates the input document', () => {
    const { model } = sampleMindmap()
    const input = docWith({ mindmap: model })
    const snapshot = JSON.stringify(input)
    flattenSubmodels(input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('is idempotent — a doc with no sub-models is returned unchanged in shape', () => {
    const { model } = sampleMindmap()
    const once = flattenSubmodels(docWith({ mindmap: model }))
    const twice = flattenSubmodels(once)
    expect(twice.shapes.filter(isMindmapShape)).toHaveLength(3)
    expect(twice.connectors.filter((c) => c.role === ROLE.mindmapBranch)).toHaveLength(2)
  })

  it('stacks migrated nodes above existing block shapes', () => {
    const { model } = sampleMindmap()
    const doc = docWith({
      mindmap: model,
      shapes: [{ id: 'block1', type: 'rectangle', x: 0, y: 0, w: 10, h: 10, zIndex: 5 }],
    })
    const out = flattenSubmodels(doc)
    const migrated = out.shapes.filter(isMindmapShape)
    expect(Math.min(...migrated.map((s) => s.zIndex))).toBeGreaterThan(5)
  })

  it('flattens both sub-models on one unified document', () => {
    const { model: mm } = sampleMindmap({ x: 600, y: 200 })
    const fc = createFlowchart('TB')
    fc.origin = { x: 600, y: 700 }
    addFlowchartNode(fc, 'process', 'Step', 0, 0)
    const out = flattenSubmodels(docWith({ mindmap: mm, flowchart: fc }))
    expect(out.shapes.filter(isMindmapShape)).toHaveLength(3)
    expect(out.shapes.filter(isFlowchartShape)).toHaveLength(1)
    // Node ids are unique across both, so no shape id collides.
    const ids = out.shapes.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('exposes the target schema version constant', () => {
    expect(SCHEMA_VERSION_FREEFLOATING).toBe(2)
  })
})

// A free-floating mind-map node shape (unified canvas), positioned away from the
// origin so the tests exercise the point→local conversion, not just w/h.
function mindmapNodeShape(partial = {}) {
  return { id: 'm2', role: ROLE.mindmapNode, x: 100, y: 200, w: 160, h: 44, ...partial }
}

describe('mindmapNodeClickAction (single-click-to-edit decision, #123)', () => {
  const node = mindmapNodeShape()

  it('EDITS a click over the label interior (offset by the shape origin)', () => {
    expect(mindmapNodeClickAction(node, { x: 180, y: 222 })).toBe('edit') // centre
    expect(mindmapNodeClickAction(node, { x: 112, y: 222 })).toBe('edit') // just inside the left rim
  })

  it('SELECTS a click on the border rim', () => {
    expect(mindmapNodeClickAction(node, { x: 103, y: 222 })).toBe('select') // near left edge
    expect(mindmapNodeClickAction(node, { x: 258, y: 222 })).toBe('select') // near right edge
    expect(mindmapNodeClickAction(node, { x: 180, y: 203 })).toBe('select') // near top edge
    expect(mindmapNodeClickAction(node, { x: 180, y: 241 })).toBe('select') // near bottom edge
  })

  it('SELECTS a click outside the node box (a stray hit never edits)', () => {
    expect(mindmapNodeClickAction(node, { x: 90, y: 222 })).toBe('select')
    expect(mindmapNodeClickAction(node, { x: 400, y: 222 })).toBe('select')
  })

  it('returns null for a non-mind-map shape, so the canvas keeps normal select', () => {
    expect(mindmapNodeClickAction({ id: 's1', x: 0, y: 0, w: 100, h: 40 }, { x: 50, y: 20 })).toBeNull()
    expect(mindmapNodeClickAction(mindmapNodeShape({ role: ROLE.flowchartNode }), { x: 180, y: 222 })).toBeNull()
    expect(mindmapNodeClickAction(null, { x: 0, y: 0 })).toBeNull()
  })

  it('treats a tiny boxless node as all-rim (select), so it never traps the caret', () => {
    // h = 16 = 2*edge: no interior at all, even dead centre selects.
    expect(mindmapNodeClickAction(mindmapNodeShape({ h: 16 }), { x: 180, y: 208 })).toBe('select')
  })
})
