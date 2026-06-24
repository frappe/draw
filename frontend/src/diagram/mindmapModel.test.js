import { describe, it, expect } from 'vitest'
import {
  createMindMap,
  addChild,
  addSibling,
  childrenOf,
  nodeById,
  descendantCount,
} from './mindmapModel.js'

describe('mindmapModel', () => {
  it('creates a single root', () => {
    const model = createMindMap('Hello')
    expect(model.nodes).toHaveLength(1)
    const root = nodeById(model, model.rootId)
    expect(root.parentId).toBeNull()
    expect(root.depth).toBe(0)
    expect(root.text).toBe('Hello')
  })

  it('adds children in order with correct parent and depth', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    const kids = childrenOf(model, model.rootId)
    expect(kids.map((n) => n.id)).toEqual([a, b])
    expect(kids.map((n) => n.order)).toEqual([0, 1])
    expect(kids.every((n) => n.depth === 1)).toBe(true)
  })

  it('adds a sibling right after a node and renumbers densely', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const c = addChild(model, model.rootId)
    const b = addSibling(model, a) // should land between a and c
    const orderIds = childrenOf(model, model.rootId).map((n) => n.id)
    expect(orderIds).toEqual([a, b, c])
    expect(childrenOf(model, model.rootId).map((n) => n.order)).toEqual([0, 1, 2])
  })

  it('refuses to add a sibling to the root', () => {
    const model = createMindMap()
    expect(addSibling(model, model.rootId)).toBeNull()
  })

  it('generates unique node ids', () => {
    const model = createMindMap()
    const ids = [model.rootId, addChild(model, model.rootId), addChild(model, model.rootId)]
    expect(new Set(ids).size).toBe(3)
    expect(ids.every((id) => typeof id === 'string' && id.startsWith('n'))).toBe(true)
  })

  it('counts descendants', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    addChild(model, a)
    addChild(model, model.rootId)
    expect(descendantCount(model, model.rootId)).toBe(3)
  })
})
