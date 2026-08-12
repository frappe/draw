import { describe, it, expect } from 'vitest'
import { createMindMap, addChild, toggleCollapsed } from './mindmapModel.js'
import {
  layoutMindMap,
  branchPath,
  branchPathPoints,
  isNodeHidden,
  hiddenDescendantCount,
  offsetPositions,
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

  it('shifts every node box by the map origin, keeping the sizes', () => {
    const model = createMindMap()
    addChild(model, model.rootId)
    const positions = layoutMindMap(model).positions
    const moved = offsetPositions(positions, { x: 120, y: -40 })
    for (const id in positions) {
      expect(moved[id].x).toBe(positions[id].x + 120)
      expect(moved[id].y).toBe(positions[id].y - 40)
      expect(moved[id].w).toBe(positions[id].w)
    }
    // A zero origin is the identity, so an unmoved map costs nothing to render.
    expect(offsetPositions(positions, { x: 0, y: 0 })).toBe(positions)
    // A malformed coordinate falls back to 0 instead of NaN-ing every box.
    expect(offsetPositions(positions, { x: NaN, y: 40 })).toEqual(
      offsetPositions(positions, { x: 0, y: 40 }),
    )
  })

  it('builds a bezier branch path that starts at the parent and ends at the child', () => {
    const parent = { x: 0, y: 0, w: 100, h: 40 }
    const child = { x: 200, y: 100, w: 80, h: 40 }
    const d = branchPath(parent, child)
    expect(d).toMatch(/^M 100 20 C/) // right edge of parent
    expect(d.trim().endsWith('200 120')).toBe(true) // left edge of child
  })

  // #266: the branch cubic must leave the parent AND ease into the child
  // horizontally — both control points share their endpoint's y (flat tangents) —
  // so a downward branch mirrors an upward one instead of plunging into the child.
  it('branchPathPoints keeps flat tangents at both ends and mirrors up vs down', () => {
    const down = branchPathPoints({ x: 0, y: 0 }, { x: 100, y: 40 })
    const up = branchPathPoints({ x: 0, y: 0 }, { x: 100, y: -40 })
    // C <c1x> <c1y=start.y> <c2x> <c2y=end.y> <endx> <endy>
    expect(down).toBe('M 0 0 C 50 0 50 40 100 40')
    expect(up).toBe('M 0 0 C 50 0 50 -40 100 -40')
    // branchPath is now defined in terms of this helper (same edge-point cubic).
    expect(branchPath({ x: 0, y: 0, w: 20, h: 40 }, { x: 100, y: 0, w: 20, h: 40 })).toBe(
      branchPathPoints({ x: 20, y: 20 }, { x: 100, y: 20 }),
    )
  })
})

// Total vertical extent of all placed boxes (a proxy for layout space used).
function span(positions, model) {
  const boxes = model.nodes.map((n) => positions[n.id]).filter(Boolean)
  const top = Math.min(...boxes.map((b) => b.y))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return bottom - top
}

// #427: nodes at the same level should read as evenly spaced. The old rule gave a
// branch a band as tall as its whole subtree and centred it there, so a branch with
// children sat four times further from its neighbour than two plain ones did.
describe('even sibling spacing (#427)', () => {
  const gapsBetween = (model, parentId, positions) => {
    const boxes = model.nodes
      .filter((node) => node.parentId === parentId)
      .map((node) => positions[node.id])
      .sort((a, b) => a.y - b.y)
    return boxes.slice(1).map((box, i) => box.y - (boxes[i].y + boxes[i].h))
  }

  it('spaces siblings equally when one of them carries children', () => {
    const model = createMindMap()
    const bushy = addChild(model, model.rootId, 'bushy', 'right')
    addChild(model, model.rootId, 'plain', 'right')
    const last = addChild(model, model.rootId, 'last', 'right')
    for (let i = 0; i < 3; i += 1) addChild(model, bushy, `b${i}`, 'right')
    addChild(model, last, 'l0', 'right')

    const { positions } = layoutMindMap(model)
    const gaps = gapsBetween(model, model.rootId, positions)
    expect(new Set(gaps).size, `sibling gaps were uneven: ${gaps.join(', ')}`).toBe(1)
    assertNoOverlaps(positions)
  })

  it('spaces siblings equally when their labels are different heights', () => {
    const model = createMindMap()
    addChild(model, model.rootId, 'short', 'right')
    addChild(model, model.rootId, 'a much longer label that has to wrap several times over', 'right')
    addChild(model, model.rootId, 'middling label', 'right')

    const { positions } = layoutMindMap(model)
    const gaps = gapsBetween(model, model.rootId, positions)
    expect(new Set(gaps).size, `sibling gaps were uneven: ${gaps.join(', ')}`).toBe(1)
    assertNoOverlaps(positions)
  })

  it('never overlaps, even where descendants force a wider gap', () => {
    const model = createMindMap()
    const ids = []
    for (let i = 0; i < 5; i += 1) ids.push(addChild(model, model.rootId, `n${i}`, 'right'))
    for (let i = 0; i < 4; i += 1) addChild(model, ids[2], `deep${i}`, 'right')
    for (let i = 0; i < 2; i += 1) addChild(model, ids[0], `x${i}`, 'right')

    const { positions } = layoutMindMap(model)
    assertNoOverlaps(positions)
    // The level below is packed evenly, whatever the level above had to do.
    expect(new Set(gapsBetween(model, ids[2], positions)).size).toBe(1)
  })
})
