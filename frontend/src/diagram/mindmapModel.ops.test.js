import { describe, it, expect } from 'vitest'
import {
  createMindMap,
  addChild,
  childrenOf,
  nodeById,
  deleteSubtree,
  promote,
  reparent,
  reorderSibling,
  toggleCollapsed,
  setAllCollapsed,
  isDescendant,
  subtreeIds,
  addCrosslink,
  removeCrosslink,
  refreshDepths,
} from './mindmapModel.js'

describe('mindmapModel — M2-M5 operations', () => {
  it('deletes a node with its whole subtree but never the root', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    addChild(model, a)
    addChild(model, a)
    const removed = deleteSubtree(model, a)
    expect(removed).toHaveLength(3)
    expect(childrenOf(model, model.rootId)).toHaveLength(0)
    expect(deleteSubtree(model, model.rootId)).toEqual([])
    expect(nodeById(model, model.rootId)).toBeTruthy()
  })

  it('drops cross-links touching a deleted subtree', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    addCrosslink(model, a, b)
    deleteSubtree(model, a)
    expect(model.crosslinks).toHaveLength(0)
  })

  it('promotes a node to be its parent\'s sibling', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId)
    const child = addChild(model, branch)
    expect(promote(model, child)).toBe(true)
    expect(nodeById(model, child).parentId).toBe(model.rootId)
    expect(nodeById(model, child).depth).toBe(1)
  })

  it('refuses to promote a first-level branch', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId)
    expect(promote(model, branch)).toBe(false)
  })

  it('reparents a node and blocks cycles into its own descendants', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    const grandchild = addChild(model, a)
    expect(reparent(model, b, a)).toBe(true)
    expect(nodeById(model, b).parentId).toBe(a)
    // Moving `a` under its own grandchild would create a cycle — must be refused.
    expect(reparent(model, a, grandchild)).toBe(false)
    expect(nodeById(model, a).parentId).toBe(model.rootId)
  })

  it('reorders siblings within bounds', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    expect(reorderSibling(model, b, -1)).toBe(true)
    expect(childrenOf(model, model.rootId).map((n) => n.id)).toEqual([b, a])
    expect(reorderSibling(model, b, -1)).toBe(false) // already first
  })

  it('toggles collapsed flags individually and en masse', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    addChild(model, a)
    toggleCollapsed(model, a)
    expect(nodeById(model, a).collapsed).toBe(true)
    setAllCollapsed(model, false)
    expect(nodeById(model, a).collapsed).toBe(false)
  })

  it('reports descendant membership and subtree ids', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const child = addChild(model, a)
    expect(isDescendant(model, a, child)).toBe(true)
    expect(isDescendant(model, child, a)).toBe(false)
    expect(subtreeIds(model, a)).toEqual([a, child])
  })

  it('adds and removes cross-links, refusing self and duplicates', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    const link = addCrosslink(model, a, b, 'relates to')
    expect(link).toBeTruthy()
    expect(addCrosslink(model, a, b)).toBeNull() // duplicate
    expect(addCrosslink(model, a, a)).toBeNull() // self
    removeCrosslink(model, link)
    expect(model.crosslinks).toHaveLength(0)
  })

  it('keeps depths consistent after re-parenting', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    const deep = addChild(model, addChild(model, a))
    reparent(model, a, b)
    refreshDepths(model)
    expect(nodeById(model, deep).depth).toBe(4)
  })
})
