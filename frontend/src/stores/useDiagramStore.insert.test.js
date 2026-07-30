import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { flowchartContentBounds } from '@/diagram/flowchartLayout.js'

// #30: inserting a mind map or flowchart placed it at the document's fixed
// default frame origin, so a user who had panned away got a frame somewhere
// off-screen and had to hunt for it. The palette now passes the visible
// viewport's centre and the starter positions the new frame's origin on it.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

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

describe('insertMindmapStarter centres a new frame on the given point', () => {
  it('puts the seeded tree at the viewport centre, not the default origin', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.mindmap.origin }
    const at = { x: 4000, y: 2500 }

    store.insertMindmapStarter(at)

    expect(store.state.mindmap.origin).not.toEqual(defaultOrigin)
    const centre = centreOf(mindmapRect(store.state))
    expect(centre.x).toBeCloseTo(at.x, 6)
    expect(centre.y).toBeCloseTo(at.y, 6)
  })

  it('leaves the origin alone when no point is given', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.mindmap.origin }
    store.insertMindmapStarter()
    expect(store.state.mindmap.origin).toEqual(defaultOrigin)
  })

  it('does not move an existing frame when a repeat insert grows it', () => {
    const store = unified()
    store.insertMindmapStarter({ x: 4000, y: 2500 })
    const placed = { ...store.state.mindmap.origin }

    store.insertMindmapStarter({ x: -1000, y: -1000 })

    expect(store.state.mindmap.origin).toEqual(placed)
    expect(store.state.mindmap.nodes.length).toBe(4) // root + 2 + the added idea
  })

  it('is one undo step, origin included', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.mindmap.origin }
    store.insertMindmapStarter({ x: 4000, y: 2500 })

    store.undo()

    expect(store.state.mindmap.nodes).toEqual([])
    expect(store.state.mindmap.origin).toEqual(defaultOrigin)
  })
})

describe('insertFlowchartStarter centres a new frame on the given point', () => {
  it('puts the two seeded nodes at the viewport centre', () => {
    const store = unified()
    const at = { x: -800, y: 3200 }

    store.insertFlowchartStarter(at)

    const centre = centreOf(flowchartRect(store.state))
    expect(centre.x).toBeCloseTo(at.x, 6)
    expect(centre.y).toBeCloseTo(at.y, 6)
  })

  it('leaves the origin alone when no point is given', () => {
    const store = unified()
    const defaultOrigin = { ...store.state.flowchart.origin }
    store.insertFlowchartStarter()
    expect(store.state.flowchart.origin).toEqual(defaultOrigin)
  })

  it('does not move an existing frame when a repeat insert appends a step', () => {
    const store = unified()
    store.insertFlowchartStarter({ x: -800, y: 3200 })
    const placed = { ...store.state.flowchart.origin }

    store.insertFlowchartStarter({ x: 0, y: 0 })

    expect(store.state.flowchart.origin).toEqual(placed)
    expect(store.state.flowchart.nodes.length).toBe(3)
  })
})

describe('the second frame inserted at one point does not land on the first', () => {
  it('drops the flowchart below the mind map', () => {
    const store = unified()
    const at = { x: 4000, y: 2500 }
    store.insertMindmapStarter(at)
    store.insertFlowchartStarter(at)

    const mm = mindmapRect(store.state)
    const fc = flowchartRect(store.state)
    expect(fc.y).toBeGreaterThanOrEqual(mm.y + mm.h)
    // Still placed relative to where the user was looking, not the canvas origin.
    expect(centreOf(fc).x).toBeCloseTo(at.x, 6)
  })

  it('drops the mind map below the flowchart in the other order', () => {
    const store = unified()
    const at = { x: 4000, y: 2500 }
    store.insertFlowchartStarter(at)
    store.insertMindmapStarter(at)

    const mm = mindmapRect(store.state)
    const fc = flowchartRect(store.state)
    expect(mm.y).toBeGreaterThanOrEqual(fc.y + fc.h)
  })

  it('centres on the point when the other frame is far away', () => {
    const store = unified()
    store.insertMindmapStarter({ x: 0, y: 0 })
    store.insertFlowchartStarter({ x: 9000, y: 9000 })

    const centre = centreOf(flowchartRect(store.state))
    expect(centre.x).toBeCloseTo(9000, 6)
    expect(centre.y).toBeCloseTo(9000, 6)
  })
})
