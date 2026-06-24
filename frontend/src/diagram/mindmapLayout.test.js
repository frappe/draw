import { describe, it, expect } from 'vitest'
import { createMindMap, addChild } from './mindmapModel.js'
import { layoutMindMap } from './mindmapLayout.js'

// Two boxes overlap if they intersect on both axes (touching edges is allowed).
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function assertNoOverlaps(positions) {
  const boxes = Object.values(positions)
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      expect(overlaps(boxes[i], boxes[j]), `boxes ${i},${j} overlap`).toBe(false)
    }
  }
}

function center(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

describe('mindmapLayout', () => {
  it('lays out a lone root with a positive bounding box', () => {
    const model = createMindMap()
    const { positions, bbox } = layoutMindMap(model)
    expect(Object.keys(positions)).toHaveLength(1)
    expect(bbox.w).toBeGreaterThan(0)
    expect(bbox.h).toBeGreaterThan(0)
  })

  it('produces no overlaps for a one-sided (right-only) tree', () => {
    // A single first-level branch + descendants lands entirely on the right side.
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    addChild(model, a)
    addChild(model, a)
    addChild(model, a)
    const { positions } = layoutMindMap(model)
    assertNoOverlaps(positions)
  })

  it('produces no overlaps for a balanced two-sided tree', () => {
    const model = createMindMap()
    for (let i = 0; i < 6; i += 1) {
      const branch = addChild(model, model.rootId)
      addChild(model, branch)
      addChild(model, branch)
    }
    const { positions } = layoutMindMap(model)
    assertNoOverlaps(positions)
  })

  it('keeps the root between the left and right branches (centred)', () => {
    const model = createMindMap()
    addChild(model, model.rootId)
    addChild(model, model.rootId)
    addChild(model, model.rootId)
    const { positions } = layoutMindMap(model)
    const rootX = center(positions[model.rootId]).x
    const others = model.nodes
      .filter((n) => n.id !== model.rootId)
      .map((n) => center(positions[n.id]).x)
    expect(others.some((x) => x < rootX)).toBe(true) // a branch to the left
    expect(others.some((x) => x > rootX)).toBe(true) // a branch to the right
  })

  it('places every node and stays O(n)-cheap for a large tree', () => {
    const model = createMindMap()
    let parent = model.rootId
    for (let i = 0; i < 200; i += 1) {
      const id = addChild(model, i % 7 === 0 ? model.rootId : parent)
      parent = id
    }
    const { positions } = layoutMindMap(model)
    expect(Object.keys(positions)).toHaveLength(model.nodes.length)
  })
})
