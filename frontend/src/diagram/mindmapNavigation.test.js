import { describe, it, expect } from 'vitest'
import { createMindMap, addChild, toggleCollapsed } from './mindmapModel.js'
import { navigate } from './mindmapNavigation.js'

describe('mindmapNavigation', () => {
  it('moves among siblings with up/down', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    expect(navigate(model, a, 'down')).toBe(b)
    expect(navigate(model, b, 'up')).toBe(a)
    expect(navigate(model, b, 'down')).toBeNull()
  })

  it('descends to the first child and back to the parent (right side)', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId) // index 0 -> right side
    const child = addChild(model, branch)
    expect(navigate(model, branch, 'right')).toBe(child) // toward children
    expect(navigate(model, child, 'left')).toBe(branch) // toward parent
  })

  it('mirrors left/right on the left side of the map', () => {
    const model = createMindMap()
    addChild(model, model.rootId) // index 0 -> right
    const leftBranch = addChild(model, model.rootId) // index 1 -> left
    const child = addChild(model, leftBranch)
    expect(navigate(model, leftBranch, 'left')).toBe(child) // children are leftward
    expect(navigate(model, child, 'right')).toBe(leftBranch) // parent is rightward
  })

  it('uses explicit branch.side (not index parity) for left/right', () => {
    const model = createMindMap()
    addChild(model, model.rootId) // auto -> right
    const forcedRight = addChild(model, model.rootId, '', 'right') // index 1, but forced right
    const child = addChild(model, forcedRight)
    // With index parity this branch would be treated as left (index 1) and the
    // arrows would invert; honouring node.side keeps them spatial.
    expect(navigate(model, forcedRight, 'right')).toBe(child) // toward children (right side)
    expect(navigate(model, child, 'left')).toBe(forcedRight) // toward parent
  })

  it('does not descend into a collapsed node', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId)
    addChild(model, branch)
    toggleCollapsed(model, branch)
    expect(navigate(model, branch, 'right')).toBeNull()
  })
})
