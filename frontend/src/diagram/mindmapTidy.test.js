import { describe, it, expect } from 'vitest'
import { tidySubtree, tidyGroup } from './mindmapTidy.js'

// A tiny tree language for the tests: nodes are {id, children}, every box 40 tall.
const NODE_H = 40
const GAP = 18

function tree(id, children = []) {
  return { id, children }
}
const options = {
  sizeOf: () => ({ w: 140, h: NODE_H }),
  childrenOf: (node) => node.children,
  gap: GAP,
}

const dy = (result, id) => result.offsets.get(id)
const gapBetween = (result, above, below) => dy(result, below) - dy(result, above) - NODE_H

describe('tidySubtree', () => {
  it('puts a lone child level with its parent', () => {
    const result = tidySubtree(tree('p', [tree('a')]), options)
    expect(dy(result, 'a')).toBe(0)
  })

  it('spaces plain siblings exactly one gap apart', () => {
    const result = tidySubtree(tree('p', [tree('a'), tree('b'), tree('c')]), options)
    expect(gapBetween(result, 'a', 'b')).toBe(GAP)
    expect(gapBetween(result, 'b', 'c')).toBe(GAP)
  })

  it('centres a parent on its children', () => {
    const result = tidySubtree(tree('p', [tree('a'), tree('b'), tree('c')]), options)
    expect(dy(result, 'p')).toBe(0)
    expect(dy(result, 'a') + dy(result, 'c')).toBe(0)
  })

  // The whole point of packing by contour (#427). Under the old band rule the
  // bushy sibling reserved its subtree's full height in its OWN column, so the two
  // leaves either side were shoved a subtree apart from it.
  it('keeps siblings a single gap apart even when one of them is bushy', () => {
    const bushy = tree('b', [tree('b0'), tree('b1'), tree('b2')])
    const result = tidySubtree(tree('p', [tree('a'), bushy, tree('c')]), options)
    expect(gapBetween(result, 'a', 'b')).toBe(GAP)
    expect(gapBetween(result, 'b', 'c')).toBe(GAP)
  })

  it('still separates the descendants that would have collided', () => {
    const left = tree('l', [tree('l0'), tree('l1')])
    const right = tree('r', [tree('r0'), tree('r1')])
    const result = tidySubtree(tree('p', [left, right]), options)
    // The two child groups clear each other at their own depth.
    expect(dy(result, 'r0') - dy(result, 'l1')).toBeGreaterThanOrEqual(NODE_H + GAP)
  })

  it('reports a contour covering every depth it occupies', () => {
    const result = tidySubtree(tree('p', [tree('a', [tree('a0')])]), options)
    expect([...result.contour.keys()].sort()).toEqual([0, 1, 2])
  })
})

describe('tidyGroup', () => {
  it('centres a group of subtrees on zero', () => {
    const subtrees = [tree('a'), tree('b'), tree('c')].map((node) => tidySubtree(node, options))
    const shifts = tidyGroup(subtrees, GAP)
    expect(shifts[0] + shifts[2]).toBeCloseTo(0, 6)
    expect(shifts[1] - shifts[0]).toBe(NODE_H + GAP)
  })

  it('is empty for no subtrees', () => {
    expect(tidyGroup([], GAP)).toEqual([])
  })
})
