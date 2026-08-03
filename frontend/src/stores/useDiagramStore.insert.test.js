import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { NODE_TYPES, defaultNodeText } from '@/diagram/flowchartModel.js'
import { clone } from '@/utils/clone.js'

// Free-floating insert path (#122). A palette insert used to seed the legacy
// mindmap/flowchart SUB-MODEL, so a freshly inserted map/chart rendered through the
// framed path — no marquee, no "+" handles, no keyboard grow — until the document
// was saved and reloaded (which migrates it to shapes). The insert now runs the SAME
// migration engine the loader does, so a fresh insert is an ordinary role-tagged
// SHAPE on state.shapes straight away — byte-identical to a migrated one — and the
// legacy sub-models are never populated. (Moots the fresh-insert cases of
// #120/#121/#129.)
//
// A unified store still carries EMPTY sub-models (schema re-seeds them post-migrate
// for interaction/collab to probe), so the invariant a test asserts is that an
// insert leaves `state.mindmap.nodes` / `state.flowchart.nodes` empty — it writes a
// free-floating shape instead of populating the frame.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

// The logical rect a container of w×h shows when centred on (cx, cy).
const viewAround = (cx, cy, w = 1600, h = 1000) => ({ x: cx - w / 2, y: cy - h / 2, w, h })

const mindmapNodes = (state) => state.shapes.filter((s) => s.role === 'mindmap-node')
const flowchartNodes = (state) => state.shapes.filter((s) => s.role === 'flowchart-node')

const rectOf = (s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })
const centreOf = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// The assertion behind the whole placement issue (#30): the user can see the insert.
const expectInsideView = (rect, view) => {
  expect(rect.x).toBeGreaterThanOrEqual(view.x - 1e-6)
  expect(rect.y).toBeGreaterThanOrEqual(view.y - 1e-6)
  expect(rect.x + rect.w).toBeLessThanOrEqual(view.x + view.w + 1e-6)
  expect(rect.y + rect.h).toBeLessThanOrEqual(view.y + view.h + 1e-6)
}

describe('insertMindmapStarter drops a free-floating mind-map node', () => {
  it('adds ONE mindmap-node root SHAPE and never populates the sub-model (#122)', () => {
    const store = unified()
    store.insertMindmapStarter(viewAround(4000, 2500))

    const nodes = mindmapNodes(store.state)
    expect(nodes.length).toBe(1)
    const root = nodes[0]
    expect(root.role).toBe('mindmap-node')
    expect(root.mindmap.isRoot).toBe(true) // a root, not a child
    expect(root.mindmap.parentId).toBeNull()
    expect(root.text.content).toBe('') // greyed "New idea" placeholder, no seeded text (#80)
    expect(store.state.connectors.length).toBe(0) // a lone root wires no branch
    // The whole point: the legacy frame sub-model is left empty, not populated.
    expect(store.state.mindmap.nodes).toEqual([])
  })

  it('places the node in the visible rect, centred (#30)', () => {
    const store = unified()
    const view = viewAround(4000, 2500)
    store.insertMindmapStarter(view)

    const rect = rectOf(mindmapNodes(store.state)[0])
    expectInsideView(rect, view)
    const centre = centreOf(rect)
    expect(centre.x).toBeCloseTo(4000, 6)
    expect(centre.y).toBeCloseTo(2500, 6)
  })

  it('selects the new root so it can be named at once', () => {
    const store = unified()
    store.insertMindmapStarter(viewAround(0, 0))
    expect(store.state.selection).toEqual([mindmapNodes(store.state)[0].id])
  })

  it('clears the empty state — state.shapes is non-empty after an insert', () => {
    const store = unified()
    expect(store.state.shapes.length).toBe(0) // "Nothing here yet" showing
    store.insertMindmapStarter(viewAround(0, 0))
    expect(store.state.shapes.length).toBeGreaterThan(0) // prompt goes away
  })

  it('is ONE undo step', () => {
    const store = unified()
    store.insertMindmapStarter(viewAround(4000, 2500))
    expect(mindmapNodes(store.state).length).toBe(1)

    store.undo()

    expect(store.state.shapes).toEqual([])
    expect(store.state.connectors).toEqual([])
    expect(store.state.mindmap.nodes).toEqual([])
  })

  // #48 (repeat insert): used to graft "New idea" onto the existing root, so a
  // second Add mind map edited the first map. Every insert is now its own shape.
  it('adds a SECOND independent node without touching the first', () => {
    const store = unified()
    store.insertMindmapStarter(viewAround(4000, 2500))
    const first = clone(mindmapNodes(store.state)[0])

    store.insertMindmapStarter(viewAround(-1000, -1000))

    const nodes = mindmapNodes(store.state)
    expect(nodes.length).toBe(2)
    expect(nodes[0].id).not.toBe(nodes[1].id) // distinct shapes
    expect(clone(nodes.find((n) => n.id === first.id))).toEqual(first) // first untouched
  })

  it('does not stack a repeat insert exactly on the previous node', () => {
    const store = unified()
    const view = viewAround(4000, 2500)
    store.insertMindmapStarter(view)
    store.insertMindmapStarter(view)

    const [a, b] = mindmapNodes(store.state).map(rectOf)
    expect(overlaps(a, b)).toBe(false)
  })

  it('inserts with no view (leaves the baked coordinates)', () => {
    const store = unified()
    store.insertMindmapStarter()
    expect(mindmapNodes(store.state).length).toBe(1)
    expect(store.state.mindmap.nodes).toEqual([])
  })
})

describe('insertFlowchartStarter drops a free-floating flowchart node', () => {
  it('adds ONE flowchart-node SHAPE of the default type, sub-model unpopulated (#122)', () => {
    const store = unified()
    store.insertFlowchartStarter(viewAround(-800, 3200))

    const nodes = flowchartNodes(store.state)
    expect(nodes.length).toBe(1)
    const node = nodes[0]
    expect(node.role).toBe('flowchart-node')
    expect(node.flowchart.nodeType).toBe('terminator') // default
    expect(node.text.content).toBe(defaultNodeText('terminator')) // empty text → type default (#80)
    expect(store.state.connectors.length).toBe(0) // a lone node wires no edge (#80)
    expect(store.state.flowchart.nodes).toEqual([]) // legacy frame left empty
  })

  it('places the node in the visible rect, centred (#30)', () => {
    const store = unified()
    const view = viewAround(-800, 3200)
    store.insertFlowchartStarter(view)

    const rect = rectOf(flowchartNodes(store.state)[0])
    expectInsideView(rect, view)
    const centre = centreOf(rect)
    expect(centre.x).toBeCloseTo(-800, 6)
    expect(centre.y).toBeCloseTo(3200, 6)
  })

  // #86: the palette exposes every node type, so any of them can seed a chart.
  it("seeds ANY requested node type, with that type's default label", () => {
    for (const type of NODE_TYPES) {
      const store = unified()
      store.insertFlowchartStarter(viewAround(0, 0), type)

      const nodes = flowchartNodes(store.state)
      expect(nodes.length).toBe(1)
      expect(nodes[0].flowchart.nodeType).toBe(type)
      expect(nodes[0].text.content).toBe(defaultNodeText(type))
    }
  })

  it('selects the new node', () => {
    const store = unified()
    store.insertFlowchartStarter(viewAround(0, 0), 'decision')
    expect(store.state.selection).toEqual([flowchartNodes(store.state)[0].id])
  })

  it('is ONE undo step', () => {
    const store = unified()
    store.insertFlowchartStarter(viewAround(-800, 3200), 'process')
    expect(flowchartNodes(store.state).length).toBe(1)

    store.undo()

    expect(store.state.shapes).toEqual([])
    expect(store.state.flowchart.nodes).toEqual([])
  })

  // #48 (repeat insert): used to append a step to the last node and wire an edge to
  // it, extending the chart already there. Each insert is now its own free node.
  it('adds a SECOND independent node without touching the first', () => {
    const store = unified()
    store.insertFlowchartStarter(viewAround(-800, 3200), 'terminator')
    const first = clone(flowchartNodes(store.state)[0])

    store.insertFlowchartStarter(viewAround(0, 0), 'decision')

    const nodes = flowchartNodes(store.state)
    expect(nodes.length).toBe(2)
    expect(store.state.connectors.length).toBe(0) // no edge tying the two together
    expect(clone(nodes.find((n) => n.id === first.id))).toEqual(first) // first untouched
    expect(nodes.map((n) => n.flowchart.nodeType).sort()).toEqual(['decision', 'terminator'])
  })

  it('inserts with no view (leaves the baked coordinates)', () => {
    const store = unified()
    store.insertFlowchartStarter()
    expect(flowchartNodes(store.state).length).toBe(1)
    expect(store.state.flowchart.nodes).toEqual([])
  })
})

describe('mind map and flowchart inserts coexist as free-floating shapes', () => {
  it('keeps both, each an independent tagged shape, each its own undo step', () => {
    const store = unified()
    const view = viewAround(1000, 1000)
    store.insertMindmapStarter(view)
    store.insertFlowchartStarter(view)

    expect(mindmapNodes(store.state).length).toBe(1)
    expect(flowchartNodes(store.state).length).toBe(1)
    expect(store.state.mindmap.nodes).toEqual([])
    expect(store.state.flowchart.nodes).toEqual([])

    // Two distinct inserts → two undo steps.
    store.undo()
    expect(flowchartNodes(store.state).length).toBe(0)
    expect(mindmapNodes(store.state).length).toBe(1)
    store.undo()
    expect(mindmapNodes(store.state).length).toBe(0)
  })

  it('places the two clear of each other in one view', () => {
    const store = unified()
    const view = viewAround(4000, 2500)
    store.insertMindmapStarter(view)
    store.insertFlowchartStarter(view)

    const mm = rectOf(mindmapNodes(store.state)[0])
    const fc = rectOf(flowchartNodes(store.state)[0])
    expect(overlaps(mm, fc)).toBe(false)
  })
})
