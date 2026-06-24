import { describe, it, expect } from 'vitest'
import { createMindMap, addChild, toggleCollapsed } from './mindmapModel.js'
import {
  layoutMindMap,
  branchPath,
  isNodeHidden,
  hiddenDescendantCount,
} from './mindmapLayout.js'

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

  it('gives a collapsed subtree zero vertical space', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId)
    const sibling = addChild(model, model.rootId)
    for (let i = 0; i < 5; i += 1) addChild(model, branch)
    const expandedSpan = span(layoutMindMap(model).positions, model)
    toggleCollapsed(model, branch)
    const collapsedSpan = span(layoutMindMap(model).positions, model)
    expect(collapsedSpan).toBeLessThan(expandedSpan)
    // The collapsed branch's children are not placed at all.
    expect(layoutMindMap(model).positions[sibling]).toBeTruthy()
  })

  it('reports hidden descendants and badge counts for a collapsed node', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId)
    const child = addChild(model, branch)
    addChild(model, child)
    toggleCollapsed(model, branch)
    expect(isNodeHidden(model, child)).toBe(true)
    expect(isNodeHidden(model, branch)).toBe(false)
    expect(hiddenDescendantCount(model, branch)).toBe(2)
  })

  it('builds a bezier branch path that starts at the parent and ends at the child', () => {
    const parent = { x: 0, y: 0, w: 100, h: 40 }
    const child = { x: 200, y: 100, w: 80, h: 40 }
    const d = branchPath(parent, child)
    expect(d).toMatch(/^M 100 20 C/) // right edge of parent
    expect(d.trim().endsWith('200 120')).toBe(true) // left edge of child
  })
})

// Total vertical extent of all placed boxes (a proxy for layout space used).
function span(positions, model) {
  const boxes = model.nodes.map((n) => positions[n.id]).filter(Boolean)
  const top = Math.min(...boxes.map((b) => b.y))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return bottom - top
}
