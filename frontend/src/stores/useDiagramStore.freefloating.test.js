import { describe, it, expect, afterEach } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { flattenSubmodels, ROLE } from '@/diagram/freeFloating.js'
import { createFlowchart, addFlowchartNode } from '@/diagram/flowchartModel.js'
import { createMindMap, addChild } from '@/diagram/mindmapModel.js'
import { useAppSettings, resetSettings } from '@/composables/useAppSettings.js'

// A store whose flowchart has been flattened to free-floating tagged shapes (the
// #122 state: state.flowchart is null, the node lives in state.shapes as a
// role-tagged shape). Exercises the phase-3c store ops the keyboard drives.
function migratedFlowchartStore(nodeType = 'terminator') {
  const fc = createFlowchart()
  const startId = addFlowchartNode(fc, nodeType, 'Start', 100, 100)
  const doc = flattenSubmodels({ ...createDiagramDocument(undefined, 'unified'), flowchart: fc })
  return { store: createDiagramStore(doc), startId }
}

describe('store.addFlowchartChildShape (free-floating #122)', () => {
  it('adds a tagged child shape + edge connector bound to the parent', () => {
    const { store, startId } = migratedFlowchartStore()
    const newId = store.addFlowchartChildShape(startId, 'process')
    expect(newId).toBeTruthy()
    const added = store.state.shapes.find((s) => s.id === newId)
    expect(added.role).toBe(ROLE.flowchartNode)
    expect(added.flowchart.nodeType).toBe('process')
    expect(added.zIndex).toBeGreaterThan(0)
    const edge = store.state.connectors.find((c) => c.to?.shapeId === newId)
    expect(edge.role).toBe(ROLE.flowchartEdge)
    expect(edge.from.shapeId).toBe(startId)
  })

  it('is one undo step (shape + connector both revert)', () => {
    const { store, startId } = migratedFlowchartStore()
    const shapesBefore = store.state.shapes.length
    const connectorsBefore = store.state.connectors.length
    store.addFlowchartChildShape(startId, 'process')
    store.undo()
    expect(store.state.shapes.length).toBe(shapesBefore)
    expect(store.state.connectors.length).toBe(connectorsBefore)
  })

  it('returns null and adds nothing for a non-flowchart parent', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.length
    expect(store.addFlowchartChildShape('nope', 'process')).toBeNull()
    expect(store.state.shapes.length).toBe(before)
  })
})

// #410: the toolbar's Node-type swap used to write only to the empty legacy
// state.flowchart, so it silently did nothing for a migrated flowchart shape —
// there was no way at all to change a node's type once it existed. This is the
// free-floating counterpart.
describe('store.swapFlowchartNodeType (free-floating #122, #410)', () => {
  it('changes the shape glyph and the flowchart tag, preserving the edge', () => {
    const { store, startId } = migratedFlowchartStore('process')
    const childId = store.addFlowchartChildShape(startId, 'process')

    store.swapFlowchartNodeType(childId, 'decision')

    const shape = store.state.shapes.find((s) => s.id === childId)
    expect(shape.type).toBe('diamond')
    expect(shape.flowchart.nodeType).toBe('decision')
    expect(shape.flowchart.branches.map((b) => b.port)).toEqual(['yes', 'no'])
    // The edge in from the parent still targets the swapped node.
    const edge = store.state.connectors.find((c) => c.to?.shapeId === childId)
    expect(edge.from.shapeId).toBe(startId)
  })

  it('adopts the new type default box', () => {
    const { store, startId } = migratedFlowchartStore('process')
    const before = store.state.shapes.find((s) => s.id === startId)
    const box = { w: before.w, h: before.h }

    store.swapFlowchartNodeType(startId, 'decision')

    const after = store.state.shapes.find((s) => s.id === startId)
    expect({ w: after.w, h: after.h }).not.toEqual(box)
  })

  it('re-homes an outgoing edge off its branch port when the node stops being a decision', () => {
    const { store, startId } = migratedFlowchartStore('decision')
    const grandchildId = store.addFlowchartChildShape(startId, 'process')
    const edgeBefore = store.state.connectors.find((c) => c.to?.shapeId === grandchildId)
    expect(edgeBefore.flowchart.fromPort).toBe('yes')

    store.swapFlowchartNodeType(startId, 'process')

    const edgeAfter = store.state.connectors.find((c) => c.to?.shapeId === grandchildId)
    expect(edgeAfter.flowchart.fromPort).toBe('out')
    expect(store.state.shapes.find((s) => s.id === startId).flowchart.branches).toEqual([])
  })

  it('is one undo step', () => {
    const { store, startId } = migratedFlowchartStore('process')
    store.swapFlowchartNodeType(startId, 'decision')
    store.undo()
    const shape = store.state.shapes.find((s) => s.id === startId)
    expect(shape.flowchart.nodeType).toBe('process')
  })

  it('is a no-op for an unknown id, a non-flowchart shape, an unchanged type or an unknown type', () => {
    const { store, startId } = migratedFlowchartStore('process')
    const blockId = store.addShape({ type: 'rectangle', x: 0, y: 0, w: 10, h: 10 })
    const before = JSON.stringify(store.state.shapes)

    store.swapFlowchartNodeType('nope', 'decision')
    store.swapFlowchartNodeType(blockId, 'decision')
    store.swapFlowchartNodeType(startId, 'process')
    store.swapFlowchartNodeType(startId, 'notAType')

    expect(JSON.stringify(store.state.shapes)).toBe(before)
  })
})

// A store whose mind map has been flattened to free-floating tagged shapes. Since
// #260 every node — root and child — defaults to a boxed monochrome node.
function migratedMindmapStore() {
  const mm = createMindMap('Root')
  const childId = addChild(mm, mm.rootId, 'Child', 'right')
  const doc = flattenSubmodels({ ...createDiagramDocument(undefined, 'unified'), mindmap: mm })
  return { store: createDiagramStore(doc), rootId: mm.rootId, childId }
}

// #260: addChildNode / addSiblingNode read the saved Child-node style default and
// stamp it onto the new node, without the pure builder knowing the setting (a
// sibling is another child node, so it honours the same default).
describe('store.addChildNode / addSiblingNode default child style (#260)', () => {
  afterEach(() => resetSettings())
  const textStyle = { border: false, fill: false, curve: 'none', align: 'left' }

  it('adds a boxed monochrome child by default', () => {
    const { store, rootId } = migratedMindmapStore()
    const newId = store.addChildNode(rootId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(true)
  })

  it('adds a transparent-text child when the Child style has border+fill off', () => {
    useAppSettings().settings.mindmapNodeStyle.child = { ...textStyle }
    const { store, rootId } = migratedMindmapStore()
    const newId = store.addChildNode(rootId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(false)
  })

  it('adds a boxed monochrome sibling by default', () => {
    const { store, childId } = migratedMindmapStore()
    const newId = store.addSiblingNode(childId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(true)
  })

  it('adds a transparent-text sibling when the Child style has border+fill off', () => {
    useAppSettings().settings.mindmapNodeStyle.child = { ...textStyle }
    const { store, childId } = migratedMindmapStore()
    const newId = store.addSiblingNode(childId)
    expect(store.shapeById(newId).mindmap.shaped).toBe(false)
  })
})

describe('store.deleteFlowchartShapes (free-floating #122)', () => {
  it('drops the node and every edge touching it (no dangling)', () => {
    const { store, startId } = migratedFlowchartStore()
    const childId = store.addFlowchartChildShape(startId, 'process')
    store.deleteFlowchartShapes([childId])
    expect(store.state.shapes.find((s) => s.id === childId)).toBeFalsy()
    expect(store.state.shapes.find((s) => s.id === startId)).toBeTruthy() // upstream stays
    const dangling = store.state.connectors.some(
      (c) => c.from?.shapeId === childId || c.to?.shapeId === childId,
    )
    expect(dangling).toBe(false)
  })

  it('clears the deleted ids from the selection', () => {
    const { store, startId } = migratedFlowchartStore()
    store.select([startId])
    store.deleteFlowchartShapes([startId])
    expect(store.state.selection).not.toContain(startId)
  })

  it('ignores ids that are not flowchart shapes', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.length
    store.deleteFlowchartShapes(['nope'])
    expect(store.state.shapes.length).toBe(before)
  })
})

// #122 P3: an explicit whole-tree Tidy for a free-floating mind map — re-flows the
// selected node's tree pinned by its root, as one undoable unit.
describe('store.applyMindmapShapeLayout (free-floating #122 P3)', () => {
  it('re-flows the tree in ONE undoable commit (undo restores prior positions)', () => {
    const { store, rootId, childId } = migratedMindmapStore()
    // Shove the child far off; Tidy should pull it back beside the root.
    store.shapeById(childId).x = 9999
    store.shapeById(childId).y = 9999
    store.applyMindmapShapeLayout('Tidy up', rootId)
    expect(store.shapeById(childId).x).toBeLessThan(9999)
    // One commit: a single undo restores the shoved-away position.
    store.undo()
    expect(store.shapeById(childId).x).toBe(9999)
    expect(store.shapeById(childId).y).toBe(9999)
  })

  it('is a no-op when the canvas has no mind-map shapes', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.map((s) => ({ id: s.id, x: s.x, y: s.y }))
    store.applyMindmapShapeLayout('Tidy up', 'nope')
    expect(store.state.shapes.map((s) => ({ id: s.id, x: s.x, y: s.y }))).toEqual(before)
  })
})

// A migrated map whose root already carries `sides` children (in that order, each
// pinned to the named side), flattened to tagged shapes and re-flowed.
function migratedMindmapStoreWith(sides) {
  const mm = createMindMap('Root')
  const ids = sides.map((side, i) => addChild(mm, mm.rootId, `C${i}`, side))
  const doc = flattenSubmodels({ ...createDiagramDocument(undefined, 'unified'), mindmap: mm })
  const store = createDiagramStore(doc)
  return { store, rootId: mm.rootId, ids }
}

// The laid-out vertical centre of a shape (children stack top→bottom on their side).
const centreY = (store, id) => store.shapeById(id).y + store.shapeById(id).h / 2

// Gap insertion (#265): addChildNodeAt drops a child at a chosen ordinal on a side and
// re-flows the tree so the new node lands in that slot.
describe('store.addChildNodeAt (gap insertion #265)', () => {
  it('inserts BETWEEN two children on a side — the new node ends up vertically between them', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'right', 'right'])
    const newId = store.addChildNodeAt(rootId, 'right', 1) // between C0 and C1
    expect(store.shapeById(newId).mindmap.parentId).toBe(rootId)
    expect(store.shapeById(newId).mindmap.side).toBe('right')
    // After the re-flow the new node sits between its two neighbours.
    expect(centreY(store, newId)).toBeGreaterThan(centreY(store, ids[0]))
    expect(centreY(store, newId)).toBeLessThan(centreY(store, ids[1]))
    // Ordinal 1: exactly one right child is above it, the rest below.
    const rightYs = [ids[0], ids[1], ids[2]].map((id) => centreY(store, id))
    const above = rightYs.filter((y) => y < centreY(store, newId)).length
    expect(above).toBe(1)
  })

  it('inserts ABOVE the top child at ordinal 0, and BELOW the last past the end', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'right'])
    const topId = store.addChildNodeAt(rootId, 'right', 0)
    expect(centreY(store, topId)).toBeLessThan(centreY(store, ids[0]))
    const botId = store.addChildNodeAt(rootId, 'right', 99) // clamps to the end
    expect(centreY(store, botId)).toBeGreaterThan(centreY(store, ids[1]))
  })

  it('scopes the ordinal to the clicked side on a two-sided root', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'left', 'right'])
    // ids[0], ids[2] are the two right children; ids[1] is the lone left child.
    const rootCentreX = store.shapeById(rootId).x + store.shapeById(rootId).w / 2
    const leftCentreBefore = centreY(store, ids[1])
    const newId = store.addChildNodeAt(rootId, 'right', 1) // between the two right children
    expect(store.shapeById(newId).mindmap.side).toBe('right')
    expect(centreY(store, newId)).toBeGreaterThan(centreY(store, ids[0]))
    expect(centreY(store, newId)).toBeLessThan(centreY(store, ids[2]))
    // The left branch keeps its side and slot — the insert only reshuffled the right
    // side, so the lone left child stays left of the root and barely moves (a re-flow
    // only re-rounds it, never reorders it).
    expect(store.shapeById(ids[1]).mindmap.side).toBe('left')
    expect(store.shapeById(ids[1]).x + store.shapeById(ids[1]).w / 2).toBeLessThan(rootCentreX)
    expect(Math.abs(centreY(store, ids[1]) - leftCentreBefore)).toBeLessThanOrEqual(1)
  })

  it('adds the first child at the same level (empty side) and selects the new node', () => {
    const { store, rootId } = migratedMindmapStoreWith([])
    const newId = store.addChildNodeAt(rootId, 'right', 0)
    expect(store.shapeById(newId)).toBeTruthy()
    expect(store.state.selection).toEqual([newId])
  })

  it('inserts + re-flows in ONE undoable commit', () => {
    const { store, rootId } = migratedMindmapStoreWith(['right', 'right'])
    const shapesBefore = store.state.shapes.length
    const newId = store.addChildNodeAt(rootId, 'right', 1)
    expect(store.state.shapes.length).toBe(shapesBefore + 1)
    store.undo()
    expect(store.state.shapes.length).toBe(shapesBefore)
    expect(store.shapeById(newId)).toBeFalsy()
  })

  it('returns null for a parent that is not a migrated mind-map shape', () => {
    const { store } = migratedFlowchartStore()
    const before = store.state.shapes.length
    expect(store.addChildNodeAt('nope', 'right', 0)).toBeNull()
    expect(store.state.shapes.length).toBe(before)
  })
})

// #427 item 5/8: a node is a text container. Its box follows its label, and the
// tree settles once when the edit lands — not on every keystroke.
describe('store.commitMindmapNodeText (#427)', () => {
  it('resizes the node to fit the committed label', () => {
    const { store, ids } = migratedMindmapStoreWith(['right'])
    const before = { ...store.shapeById(ids[0]) }
    store.commitMindmapNodeText(ids[0], { content: 'a much longer idea than before', html: '' })
    const after = store.shapeById(ids[0])
    expect(after.text.content).toBe('a much longer idea than before')
    expect(after.w).toBeGreaterThan(before.w)
  })

  it('is one undo step covering the text, the box and the re-flow', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'right'])
    const sibling = { ...store.shapeById(ids[1]) }
    const before = store.shapeById(ids[0])
    const edited = { w: before.w, h: before.h, content: before.text.content }
    store.commitMindmapNodeText(ids[0], { content: 'w'.repeat(80), html: '' })
    store.undo()
    const restored = store.shapeById(ids[0])
    expect([restored.w, restored.h, restored.text.content]).toEqual([edited.w, edited.h, edited.content])
    expect(store.shapeById(ids[1])).toMatchObject({ x: sibling.x, y: sibling.y })
    expect(store.shapeById(rootId)).toBeTruthy()
  })

  it('re-flows so a grown node stops overlapping its sibling', () => {
    const { store, ids } = migratedMindmapStoreWith(['right', 'right'])
    store.commitMindmapNodeText(ids[0], { content: 'w'.repeat(120), html: '' })
    const grown = store.shapeById(ids[0])
    const sibling = store.shapeById(ids[1])
    expect(grown.y + grown.h).toBeLessThanOrEqual(sibling.y)
  })

  it('ignores an id that is not on the canvas', () => {
    const { store } = migratedMindmapStoreWith(['right'])
    expect(() => store.commitMindmapNodeText('nope', { content: 'x', html: '' })).not.toThrow()
  })
})

// #427 item 4: a mind map is auto-laid-out, so dragging a node moves it in the
// TREE — parent, side, order — and lets the layout place it.
describe('store.moveMindmapNode (#427)', () => {
  it('re-parents the node and re-points its branch, keeping the connector id', () => {
    const { store, ids } = migratedMindmapStoreWith(['right', 'right'])
    const branchBefore = store.state.connectors.find((c) => c.to?.shapeId === ids[1])
    store.moveMindmapNode(ids[1], { kind: 'onto', parentId: ids[0] })
    expect(store.shapeById(ids[1]).mindmap.parentId).toBe(ids[0])
    const branchAfter = store.state.connectors.find((c) => c.to?.shapeId === ids[1])
    expect(branchAfter.id).toBe(branchBefore.id)
    expect(branchAfter.from.shapeId).toBe(ids[0])
  })

  it('re-orders among siblings without changing the parent', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'right', 'right'])
    store.moveMindmapNode(ids[2], { kind: 'gap', parentId: rootId, side: 'right', index: 0 })
    expect(store.shapeById(ids[2]).mindmap.parentId).toBe(rootId)
    expect(centreY(store, ids[2])).toBeLessThan(centreY(store, ids[0]))
  })

  it('leaves clean integer orders behind', () => {
    const { store, rootId, ids } = migratedMindmapStoreWith(['right', 'right', 'right'])
    store.moveMindmapNode(ids[2], { kind: 'gap', parentId: rootId, side: 'right', index: 0 })
    const orders = store.state.shapes
      .filter((s) => s.mindmap?.parentId === rootId)
      .map((s) => s.mindmap.order)
      .sort((a, b) => a - b)
    expect(orders).toEqual([0, 1, 2])
  })

  it('is one undo step covering the move and the re-flow', () => {
    const { store, ids } = migratedMindmapStoreWith(['right', 'right'])
    const live = store.shapeById(ids[1])
    const before = { parentId: live.mindmap.parentId, x: live.x, y: live.y }
    store.moveMindmapNode(ids[1], { kind: 'onto', parentId: ids[0] })
    store.undo()
    const restored = store.shapeById(ids[1])
    expect(restored.mindmap.parentId).toBe(before.parentId)
    expect([restored.x, restored.y]).toEqual([before.x, before.y])
    expect(store.state.connectors.find((c) => c.to?.shapeId === ids[1]).from.shapeId).toBe(
      before.parentId,
    )
  })

  it('does nothing for a slot whose parent has gone', () => {
    const { store, ids } = migratedMindmapStoreWith(['right'])
    const before = store.shapeById(ids[0]).mindmap.parentId
    store.moveMindmapNode(ids[0], { kind: 'onto', parentId: 'nope' })
    expect(store.shapeById(ids[0]).mindmap.parentId).toBe(before)
  })
})
