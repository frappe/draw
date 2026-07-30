import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
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

  it('does not move an existing frame when a repeat insert grows it', () => {
    const store = unified()
    store.insertMindmapStarter(viewAround(4000, 2500))
    const placed = { ...store.state.mindmap.origin }

    store.insertMindmapStarter(viewAround(-1000, -1000))

    expect(store.state.mindmap.origin).toEqual(placed)
    expect(store.state.mindmap.nodes.length).toBe(4) // root + 2 + the added idea
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
  it('centres the two seeded nodes in the view', () => {
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

  it('does not move an existing frame when a repeat insert appends a step', () => {
    const store = unified()
    store.insertFlowchartStarter(viewAround(-800, 3200))
    const placed = { ...store.state.flowchart.origin }

    store.insertFlowchartStarter(viewAround(0, 0))

    expect(store.state.flowchart.origin).toEqual(placed)
    expect(store.state.flowchart.nodes.length).toBe(3)
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
