import { describe, it, expect } from 'vitest'
import {
  buildMindmapChild,
  buildMindmapSibling,
  buildFlowchartChild,
  flowchartLayoutPatches,
  flowchartDirectionOfShapes,
  mindmapLayoutPatches,
  mindmapDragTargets,
} from './freeFloatingOps.js'
import { flattenSubmodels, ROLE } from './freeFloating.js'
import { createMindMap, addChild } from './mindmapModel.js'
import { createFlowchart, addFlowchartNode, addFlowchartEdge, autoNumberFlow } from './flowchartModel.js'
import { tidyLayout, toggleDirection } from './flowchartLayout.js'

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

// #273: mind-map nodes are auto-laid-out. A drag on a child moves nothing; a drag on
// a root moves the whole tree; a non-mind-map shape drags freely.
describe('mindmapDragTargets (#273)', () => {
  it('returns null for a shape that is not a mind-map node', () => {
    expect(mindmapDragTargets([{ id: 'r1', role: 'shape' }], 'r1')).toBeNull()
    expect(mindmapDragTargets([], 'missing')).toBeNull()
  })

  it('returns an empty set for a child — auto-laid-out, not freely draggable', () => {
    const { shapes, rootId } = rootShapes()
    const child = buildMindmapChild(shapes, rootId, 'ocean')
    expect(mindmapDragTargets([...shapes, child.shape], child.shape.id)).toEqual([])
  })

  it('returns just the root when it has no children', () => {
    const { shapes, rootId } = rootShapes()
    expect(mindmapDragTargets(shapes, rootId)).toEqual([rootId])
  })

  it('returns the whole tree for a root — dragging it moves the map', () => {
    let { shapes, rootId } = rootShapes()
    const c1 = buildMindmapChild(shapes, rootId, 'ocean')
    let all = [...shapes, c1.shape]
    const c2 = buildMindmapChild(all, rootId, 'ocean')
    all = [...all, c2.shape]
    const set = mindmapDragTargets(all, rootId)
    expect(set).toEqual(expect.arrayContaining([rootId, c1.shape.id, c2.shape.id]))
    expect(set).toHaveLength(3)
  })
})

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

  it('builds children as a boxed monochrome node by default (#260 reverses #125)', () => {
    const { shapes, rootId } = rootShapes()
    const { shape } = buildMindmapChild(shapes, rootId, 'ocean')
    expect(shape.mindmap.shaped).toBe(true)
    expect(shape.fill).toBe('#F3F3F3') // NODE_GRAY fill
    expect(shape.border.color).toBe('#C7C7C7') // NODE_GRAY border
    expect(shape.mindmap.curve).toBe('moderate')
  })

  it('honours the Child style: border+fill off renders transparent text (#260)', () => {
    const { shapes, rootId } = rootShapes()
    const textStyle = { border: false, fill: false, curve: 'none', align: 'left' }
    expect(buildMindmapChild(shapes, rootId, 'ocean', null, textStyle).shape.mindmap.shaped).toBe(false)
    expect(buildMindmapChild(shapes, rootId, 'ocean').shape.mindmap.shaped).toBe(true)
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

  it('honours the Child style for a sibling too (#260)', () => {
    const { shapes, rootId } = rootShapes()
    const textStyle = { border: false, fill: false, curve: 'none', align: 'left' }
    expect(buildMindmapSibling(shapes, rootId, 'ocean', textStyle).shape.mindmap.shaped).toBe(false)
    expect(buildMindmapSibling(shapes, rootId, 'ocean').shape.mindmap.shaped).toBe(true)
  })
})

// #122 P3: the free-floating counterpart of a standalone map's live auto-layout —
// an explicit whole-tree Tidy, pinned by the tree's root, run over the tagged shapes.
describe('mindmapLayoutPatches', () => {
  // A migrated single root grown with two children (first right, second left, by the
  // balancing in buildMindmapChild), returned as merged shapes[]/connectors[].
  function grownTree() {
    let { shapes, connectors, rootId } = rootShapes()
    const c1 = buildMindmapChild(shapes, rootId, 'ocean')
    shapes = [...shapes, c1.shape]
    connectors = [...connectors, c1.connector]
    const c2 = buildMindmapChild(shapes, rootId, 'ocean')
    shapes = [...shapes, c2.shape]
    connectors = [...connectors, c2.connector]
    return { shapes, connectors, rootId, childIds: [c1.shape.id, c2.shape.id] }
  }

  it('is a no-op when there are no mind-map shapes', () => {
    expect(mindmapLayoutPatches([], [], 'anything').nodes).toEqual([])
  })

  it('pins the tree by its root — the root patch keeps its position', () => {
    const { shapes, connectors, rootId } = grownTree()
    const root = shapes.find((s) => s.id === rootId)
    const patches = mindmapLayoutPatches(shapes, connectors, rootId)
    const rootPatch = patches.nodes.find((n) => n.id === rootId)
    expect(rootPatch.x).toBe(root.x)
    expect(rootPatch.y).toBe(root.y)
  })

  it('re-flows child nodes around the pinned root (pulls a shoved child back)', () => {
    const { shapes, connectors, rootId, childIds } = grownTree()
    const kid = shapes.find((s) => s.id === childIds[0])
    kid.x = 9999
    kid.y = 9999
    const patches = mindmapLayoutPatches(shapes, connectors, rootId)
    const kidPatch = patches.nodes.find((n) => n.id === childIds[0])
    // The layout derives positions from the tree, not the shoved coords, so the child
    // lands back beside the root — nowhere near the 9999 slot it was dragged to.
    expect(kidPatch.x).toBeLessThan(9999)
    expect(kidPatch.y).toBeLessThan(9999)
  })

  it('branch edge patches carry anchors matching each child side', () => {
    const { shapes, connectors, rootId, childIds } = grownTree()
    const patches = mindmapLayoutPatches(shapes, connectors, rootId)
    expect(patches.edges).toHaveLength(2)
    // Every branch leaves the parent on one side and enters the child on the other.
    for (const e of patches.edges) {
      expect(['left', 'right']).toContain(e.fromAnchor)
      expect(e.toAnchor).toBe(e.fromAnchor === 'right' ? 'left' : 'right')
    }
    // The right-side child's branch leaves the root's right edge, the left-side's left.
    const rightBranch = connectors.find((c) => c.role === ROLE.mindmapBranch && c.to.shapeId === childIds[0])
    const leftBranch = connectors.find((c) => c.role === ROLE.mindmapBranch && c.to.shapeId === childIds[1])
    expect(patches.edges.find((e) => e.id === rightBranch.id).fromAnchor).toBe('right')
    expect(patches.edges.find((e) => e.id === leftBranch.id).fromAnchor).toBe('left')
  })

  it('scopes to the selected tree — a second map on the canvas gets no patches', () => {
    const a = grownTree()
    const b = grownTree()
    const shapes = [...a.shapes, ...b.shapes]
    const connectors = [...a.connectors, ...b.connectors]
    const patches = mindmapLayoutPatches(shapes, connectors, a.rootId)
    const patchedIds = patches.nodes.map((n) => n.id)
    for (const id of [b.rootId, ...b.childIds]) expect(patchedIds).not.toContain(id)
    const bEdgeIds = b.connectors.filter((c) => c.role === ROLE.mindmapBranch).map((c) => c.id)
    for (const id of bEdgeIds) expect(patches.edges.some((e) => e.id === id)).toBe(false)
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

// #98: the free-floating counterpart of BottomPalette's Tidy / flip / number, run
// over the tagged shapes instead of the standalone sub-model.
describe('flowchartLayoutPatches', () => {
  // A migrated Start -> Process chart's shapes[]/connectors[].
  function twoNodeChart() {
    const { shapes, connectors, startId } = flowchartShapes('terminator')
    const built = buildFlowchartChild(shapes, connectors, startId, 'process')
    built.shape.zIndex = 5
    return {
      shapes: [...shapes, built.shape],
      connectors: [...connectors, built.connector],
      startId,
      childId: built.shape.id,
    }
  }

  // Persist node patches back onto the shapes, the way the store's commit does, so a
  // follow-up call sees the new positions / direction / step-number state.
  function applyNodePatches(shapes, nodePatches) {
    for (const p of nodePatches) {
      const s = shapes.find((sh) => sh.id === p.id)
      if (!s) continue
      s.x = p.x
      s.y = p.y
      if (s.text) s.text.content = p.text
      s.flowchart = { ...(s.flowchart || {}), manuallyPositioned: p.manuallyPositioned, direction: p.direction }
      if (p.stepPrefix) s.flowchart.stepPrefix = p.stepPrefix
      else delete s.flowchart.stepPrefix
    }
  }

  it('defaults the direction to TB before any flip', () => {
    const { shapes } = twoNodeChart()
    expect(flowchartDirectionOfShapes(shapes)).toBe('TB')
  })

  it('is a no-op when there are no flowchart shapes', () => {
    expect(flowchartLayoutPatches([], [], (m) => tidyLayout(m)).nodes).toEqual([])
  })

  it('Tidy re-flows the shapes below one another and clears manual flags', () => {
    const { shapes, connectors, startId, childId } = twoNodeChart()
    const child = shapes.find((s) => s.id === childId)
    child.flowchart.manuallyPositioned = true
    child.x = 999
    child.y = 999
    const patches = flowchartLayoutPatches(shapes, connectors, (m) => tidyLayout(m))
    const start = patches.nodes.find((n) => n.id === startId)
    const kid = patches.nodes.find((n) => n.id === childId)
    expect(kid.manuallyPositioned).toBe(false)
    expect(kid.y).toBeGreaterThan(start.y) // child sits below the start (TB)
    expect(kid.x).toBeLessThan(999) // pulled back from the shoved-away slot
  })

  it('Flip toggles the persisted direction and re-lays-out along the new axis', () => {
    const { shapes, connectors, startId, childId } = twoNodeChart()
    const first = flowchartLayoutPatches(shapes, connectors, (m) => toggleDirection(m))
    expect(first.nodes.every((n) => n.direction === 'LR')).toBe(true)
    const start = first.nodes.find((n) => n.id === startId)
    const kid = first.nodes.find((n) => n.id === childId)
    expect(kid.x).toBeGreaterThan(start.x) // child now to the RIGHT of the start
    // Persisting + flipping again returns to TB (proves the direction round-trips).
    applyNodePatches(shapes, first.nodes)
    const second = flowchartLayoutPatches(shapes, connectors, (m) => toggleDirection(m))
    expect(second.nodes.every((n) => n.direction === 'TB')).toBe(true)
  })

  it('recomputes edge anchors so the arrow leaves the new side after a flip', () => {
    const { shapes, connectors } = twoNodeChart()
    const patches = flowchartLayoutPatches(shapes, connectors, (m) => toggleDirection(m))
    expect(patches.edges).toHaveLength(1)
    expect(patches.edges[0].fromAnchor).toBe('right')
    expect(patches.edges[0].toAnchor).toBe('left')
  })

  it('Number steps prefixes each node in flow order, then strips them on toggle off', () => {
    const { shapes, connectors, startId, childId } = twoNodeChart()
    const on = flowchartLayoutPatches(shapes, connectors, (m) => autoNumberFlow(m))
    const start = on.nodes.find((n) => n.id === startId)
    const kid = on.nodes.find((n) => n.id === childId)
    expect(start.text).toBe('1. Start')
    expect(kid.text).toBe('2. Process')
    expect(start.stepPrefix).toBe('1. ')
    // Persist, then toggle off — the exact prefixes are removed, text restored.
    applyNodePatches(shapes, on.nodes)
    const off = flowchartLayoutPatches(shapes, connectors, (m) => autoNumberFlow(m))
    const startOff = off.nodes.find((n) => n.id === startId)
    expect(startOff.text).toBe('Start')
    expect(startOff.stepPrefix).toBeNull()
  })

  // #167: two independent flowcharts share the canvas; an action seeded with a node in
  // chart A must re-flow ONLY chart A and leave chart B exactly where it was.
  describe('scoped to the selected chart (#167)', () => {
    // A migrated linear chart (Start → Step) at the given origin, so the two charts sit
    // apart on the canvas and never share an edge.
    function linearChart(origin) {
      const model = createFlowchart('TB')
      model.origin = origin
      const start = addFlowchartNode(model, 'terminator', 'Start', 0, 0)
      const step = addFlowchartNode(model, 'process', 'Step', 0, 120)
      addFlowchartEdge(model, start, step)
      const doc = flattenSubmodels({
        schemaVersion: 2, diagramType: 'unified',
        canvas: { width: 1920, height: 1080, background: null },
        shapes: [], connectors: [], sections: [],
        mindmap: null, flowchart: model, whiteboard: null,
      })
      return { shapes: doc.shapes, connectors: doc.connectors, ids: [start, step], startId: start }
    }

    function twoCharts() {
      const a = linearChart({ x: 0, y: 0 })
      const b = linearChart({ x: 2000, y: 0 })
      return {
        shapes: [...a.shapes, ...b.shapes],
        connectors: [...a.connectors, ...b.connectors],
        a,
        b,
      }
    }

    function boxesOf(shapes, ids) {
      return ids.map((id) => {
        const s = shapes.find((sh) => sh.id === id)
        return { id, x: s.x, y: s.y }
      })
    }

    it('Tidy on chart A patches only chart A; chart B is untouched', () => {
      const { shapes, connectors, a, b } = twoCharts()
      // Shove chart A's step out of place so a real Tidy has something to pull back.
      const aStep = shapes.find((s) => s.id === a.ids[1])
      aStep.flowchart.manuallyPositioned = true
      aStep.x = 9999
      aStep.y = 9999
      const before = boxesOf(shapes, b.ids)

      const patches = flowchartLayoutPatches(shapes, connectors, (m) => tidyLayout(m), a.startId)
      const patchedIds = patches.nodes.map((n) => n.id).sort()
      expect(patchedIds).toEqual([...a.ids].sort())
      for (const id of b.ids) expect(patches.nodes.some((n) => n.id === id)).toBe(false)

      // Persist the patches the way the store commit does; chart B stays put.
      applyNodePatches(shapes, patches.nodes)
      expect(boxesOf(shapes, b.ids)).toEqual(before)
    })

    it('Flip on chart A flips only chart A; chart B keeps its direction', () => {
      const { shapes, connectors, a, b } = twoCharts()
      const patches = flowchartLayoutPatches(shapes, connectors, (m) => toggleDirection(m), a.startId)
      expect(patches.nodes.map((n) => n.id).sort()).toEqual([...a.ids].sort())
      expect(patches.nodes.every((n) => n.direction === 'LR')).toBe(true)

      applyNodePatches(shapes, patches.nodes)
      // Chart B's nodes never got a direction patch, so they read TB unchanged.
      const bStart = shapes.find((s) => s.id === b.ids[0])
      expect(bStart.flowchart?.direction ?? 'TB').toBe('TB')
    })

    it('only edges within the component get anchor patches', () => {
      const { shapes, connectors, a, b } = twoCharts()
      const patches = flowchartLayoutPatches(shapes, connectors, (m) => toggleDirection(m), a.startId)
      const aEdge = a.connectors.find((c) => c.role === ROLE.flowchartEdge)
      const bEdge = b.connectors.find((c) => c.role === ROLE.flowchartEdge)
      const edgeIds = patches.edges.map((e) => e.id)
      expect(edgeIds).toContain(aEdge.id)
      expect(edgeIds).not.toContain(bEdge.id)
    })

    it('with no rootId it falls back to the whole canvas (legacy behaviour)', () => {
      const { shapes, connectors, a, b } = twoCharts()
      const patches = flowchartLayoutPatches(shapes, connectors, (m) => tidyLayout(m))
      const patchedIds = patches.nodes.map((n) => n.id).sort()
      expect(patchedIds).toEqual([...a.ids, ...b.ids].sort())
    })
  })
})
