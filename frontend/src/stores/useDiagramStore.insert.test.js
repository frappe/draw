import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { layoutMindMap, mindmapTreeRects } from '@/diagram/mindmapLayout.js'
import { subtreeIds, nodeById } from '@/diagram/mindmapModel.js'
import { flowchartContentBounds } from '@/diagram/flowchartLayout.js'

// #30: inserting a mind map or flowchart placed it at the document's fixed
// default frame origin, so a user who had panned away got a frame somewhere
// off-screen and had to hunt for it. The palette now passes the logical rect on
// screen and the starter places the new frame inside it.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

// The logical rect a container of w×h shows when centred on (cx, cy).
const viewAround = (cx, cy, w = 1600, h = 1000) => ({ x: cx - w / 2, y: cy - h / 2, w, h })

// Where the frame's content actually ends up on the shared canvas.
const mindmapRect = (state) => {
  const bbox = layoutMindMap(state.mindmap).bbox
  const o = state.mindmap.origin
  return { x: o.x + (bbox.x || 0), y: o.y + (bbox.y || 0), w: bbox.w, h: bbox.h }
}
const flowchartRect = (state) => {
  const bbox = flowchartContentBounds(state.flowchart)
  const o = state.flowchart.origin
  return { x: o.x + bbox.x, y: o.y + bbox.y, w: bbox.w, h: bbox.h }
}
// Each independent tree on the map (#48): its node ids/texts and where it sits.
const trees = (state) => {
  const { positions } = layoutMindMap(state.mindmap)
  const o = state.mindmap.origin
  return mindmapTreeRects(state.mindmap, positions).map((rect) => ({
    nodes: subtreeIds(state.mindmap, rect.rootId).map((id) => nodeById(state.mindmap, id).text),
    rect: { x: rect.x + o.x, y: rect.y + o.y, w: rect.w, h: rect.h },
  }))
}
const centreOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// The assertion behind the whole issue: the user can see the new frame.
const expectInsideView = (rect, view) => {
  expect(rect.x).toBeGreaterThanOrEqual(view.x - 1e-6)
  expect(rect.y).toBeGreaterThanOrEqual(view.y - 1e-6)
  expect(rect.x + rect.w).toBeLessThanOrEqual(view.x + view.w + 1e-6)
  expect(rect.y + rect.h).toBeLessThanOrEqual(view.y + view.h + 1e-6)
}

describe('insertMindmapStarter places a new frame in the visible rect', () => {
  it('centres the seeded tree in the view, not at the default origin', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.mindmap.origin }
    const view = viewAround(4000, 2500)

    store.insertMindmapStarter(view)

    expect(store.state.mindmap.origin).not.toEqual(defaultOrigin)
    const centre = centreOf(mindmapRect(store.state))
    expect(centre.x).toBeCloseTo(4000, 6)
    expect(centre.y).toBeCloseTo(2500, 6)
  })

  it('leaves the origin alone when no view is given', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.mindmap.origin }
    store.insertMindmapStarter()
    expect(store.state.mindmap.origin).toEqual(defaultOrigin)
  })

  it('seeds a single empty root — no children, no default text (#80)', () => {
    const store = unified()
    store.insertMindmapStarter()
    expect(store.state.mindmap.nodes.length).toBe(1)
    expect(store.state.mindmap.nodes[0].parentId).toBeFalsy() // a root, not a child
    expect(store.state.mindmap.nodes[0].text).toBe('') // greyed placeholder, no real text
  })

  // #48: a repeat insert used to graft "New idea" onto the existing root, so the
  // second Add mind map edited the first map instead of making one of its own.
  it('adds a SECOND independent tree, leaving the first one alone', () => {
    const store = unified()
    store.insertMindmapStarter(viewAround(4000, 2500))
    const placed = { ...store.state.mindmap.origin }
    const before = trees(store.state)

    store.insertMindmapStarter(viewAround(-1000, -1000))

    const after = trees(store.state)
    expect(after.length).toBe(2)
    expect(store.state.mindmap.nodes.length).toBe(2) // two roots, no default branches (#80)
    // The first tree keeps its nodes AND its place on the canvas.
    expect(after[0]).toEqual(before[0])
    expect(store.state.mindmap.origin).toEqual(placed)
  })

  it('places the second tree in the view it was inserted into, clear of the first', () => {
    const store = unified()
    const view = viewAround(4000, 2500)
    store.insertMindmapStarter(view)
    store.insertMindmapStarter(view)

    const [first, second] = trees(store.state).map((t) => t.rect)
    expect(overlaps(first, second)).toBe(false)
    expectInsideView(second, view)
  })

  it('is one undo step, origin included', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.mindmap.origin }
    store.insertMindmapStarter(viewAround(4000, 2500))

    store.undo()

    expect(store.state.mindmap.nodes).toEqual([])
    expect(store.state.mindmap.origin).toEqual(defaultOrigin)
  })
})

describe('insertFlowchartStarter places a new frame in the visible rect', () => {
  it('centres the seeded node in the view', () => {
    const store = unified()
    const view = viewAround(-800, 3200)

    store.insertFlowchartStarter(view)

    const centre = centreOf(flowchartRect(store.state))
    expect(centre.x).toBeCloseTo(-800, 6)
    expect(centre.y).toBeCloseTo(3200, 6)
  })

  it('leaves the origin alone when no view is given', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.flowchart.origin }
    store.insertFlowchartStarter()
    expect(store.state.flowchart.origin).toEqual(defaultOrigin)
  })

  it('seeds a single node with no edge (#80)', () => {
    const store = unified()
    store.insertFlowchartStarter()
    expect(store.state.flowchart.nodes.length).toBe(1)
    expect(store.state.flowchart.edges.length).toBe(0)
  })

  // #48: a repeat insert used to append a step to the last node and wire an edge
  // to it, extending the chart already there instead of starting a new one.
  it('adds a SECOND independent chart, unconnected to the first', () => {
    const store = unified()
    store.insertFlowchartStarter(viewAround(-800, 3200))
    const placed = { ...store.state.flowchart.origin }
    const before = store.state.flowchart.nodes.map((n) => ({ ...n }))

    store.insertFlowchartStarter(viewAround(0, 0))

    const fc = store.state.flowchart
    expect(fc.nodes.length).toBe(2) // one node per chart (#80)
    expect(fc.edges.length).toBe(0) // single-node starters wire no edges
    // The first chart's node is untouched, and the frame stays where it was.
    expect(fc.nodes.slice(0, 1)).toEqual(before)
    expect(fc.origin).toEqual(placed)
    // The new chart sits below the old one, not on top of it.
    const added = fc.nodes.slice(1)
    expect(Math.min(...added.map((n) => n.y))).toBeGreaterThan(Math.max(...before.map((n) => n.y)))
  })
})

describe('the second frame inserted into one view stays on screen', () => {
  it('clears the mind map without leaving the view', () => {
    const store = unified()
    const view = viewAround(4000, 2500)
    store.insertMindmapStarter(view)
    store.insertFlowchartStarter(view)

    const mm = mindmapRect(store.state)
    const fc = flowchartRect(store.state)
    expect(overlaps(fc, mm)).toBe(false)
    expectInsideView(fc, view)
  })

  it('clears the flowchart without leaving the view in the other order', () => {
    const store = unified()
    const view = viewAround(4000, 2500)
    store.insertFlowchartStarter(view)
    store.insertMindmapStarter(view)

    const mm = mindmapRect(store.state)
    const fc = flowchartRect(store.state)
    expect(overlaps(mm, fc)).toBe(false)
    expectInsideView(mm, view)
  })

  // The reported regression: clearing the other frame outright used to push the new
  // one below the bottom edge whenever the view was too small to hold both.
  it('stays in a view too small to clear the other frame', () => {
    const store = unified()
    const view = viewAround(4000, 2500, 900, 520)
    store.insertMindmapStarter(view)
    store.insertFlowchartStarter(view)

    expectInsideView(flowchartRect(store.state), view)
  })

  it('centres in the view when the other frame is far away', () => {
    const store = unified()
    store.insertMindmapStarter(viewAround(0, 0))
    store.insertFlowchartStarter(viewAround(9000, 9000))

    const centre = centreOf(flowchartRect(store.state))
    expect(centre.x).toBeCloseTo(9000, 6)
    expect(centre.y).toBeCloseTo(9000, 6)
  })
})
