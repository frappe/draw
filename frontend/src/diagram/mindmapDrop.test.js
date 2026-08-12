import { describe, it, expect } from 'vitest'
import {
  DROP_CAPTURE,
  contextWithout,
  dropSlotsFor,
  dropTargetAt,
  indicatorFor,
  siblingsForSlot,
  orderForSlot,
  dropPatches,
  isNoOpDrop,
} from './mindmapDrop.js'
import { handlesForNode } from './mindmapHandles.js'
import { ROLE } from './freeFloating.js'

// Boxes are hand-placed so a drop can be asserted to the pixel, independent of the
// auto-layout — the same convention as mindmapHandles.test.js.
function mmNode(id, parentId, x, y, order = 0, side = 'right', depth = parentId ? 1 : 0) {
  return {
    id,
    type: 'rounded',
    x,
    y,
    w: 140,
    h: 40,
    zIndex: 1,
    text: { content: id, style: { size: 16 } },
    role: ROLE.mindmapNode,
    mindmap: { parentId: parentId || null, order, depth, side },
  }
}

// Root with three right-side children stacked top→bottom, and a grandchild under
// the middle one, so re-parenting has somewhere real to go.
function tree() {
  return [
    mmNode('root', null, 0, 200, 0),
    mmNode('a', 'root', 300, 100, 0),
    mmNode('b', 'root', 300, 200, 1),
    mmNode('c', 'root', 300, 300, 2),
    mmNode('b1', 'b', 600, 200, 0, 'right', 2),
  ]
}

describe('contextWithout', () => {
  it('describes the tree as it will be once the dragged branch has left', () => {
    const ctx = contextWithout(tree(), 'b')
    expect(Object.keys(ctx.boxes).sort()).toEqual(['a', 'c', 'root'])
  })
})

describe('dropSlotsFor', () => {
  it('offers every remaining node as a parent, plus its gap slots', () => {
    const shapes = tree()
    const ctx = contextWithout(shapes, 'c')
    const slots = dropSlotsFor(ctx, 'c')
    expect(slots.filter((s) => s.kind === 'onto').map((s) => s.parentId).sort()).toEqual([
      'a', 'b', 'b1', 'root',
    ])
    expect(slots.some((s) => s.kind === 'gap' && s.parentId === 'root')).toBe(true)
  })

  it('marks the same ordinals the "+" handles do, so both add in one place', () => {
    const ctx = contextWithout(tree(), 'c')
    const slots = dropSlotsFor(ctx, 'c').filter((s) => s.kind === 'gap' && s.parentId === 'root')
    const handles = handlesForNode('root', ctx)
    expect(slots.map((s) => s.y).sort()).toEqual(handles.map((h) => h.cy).sort())
  })

  // A "+" is drawn just off the parent's edge, but a node is DRAGGED to where it
  // should end up: into the column its new siblings occupy.
  it('aims a gap at the child column, not at the parent edge the "+" sits on', () => {
    const ctx = contextWithout(tree(), 'c')
    const slot = dropSlotsFor(ctx, 'c').find((s) => s.kind === 'gap' && s.parentId === 'root')
    const sibling = ctx.boxes.a
    expect(slot.x).toBe(sibling.x + sibling.w / 2)
  })

  it('aims at where the first child WOULD go when the parent has none yet', () => {
    const ctx = contextWithout(tree(), 'c')
    const slot = dropSlotsFor(ctx, 'c').find((s) => s.kind === 'gap' && s.parentId === 'b1')
    expect(slot.x).toBeGreaterThan(ctx.boxes.b1.x + ctx.boxes.b1.w)
  })

  it('never offers the dragged node or its own descendants as a parent', () => {
    const ctx = contextWithout(tree(), 'b')
    const parents = dropSlotsFor(ctx, 'b').map((s) => s.parentId)
    expect(parents).not.toContain('b')
    expect(parents).not.toContain('b1') // a node cannot be re-parented into itself
  })
})

describe('dropTargetAt', () => {
  it('drops INTO a node the pointer is inside', () => {
    const slots = dropSlotsFor(contextWithout(tree(), 'c'), 'c')
    const target = dropTargetAt({ x: 370, y: 120 }, slots) // inside 'a'
    expect(target).toMatchObject({ kind: 'onto', parentId: 'a' })
  })

  it('otherwise takes the nearest gap', () => {
    const ctx = contextWithout(tree(), 'c')
    const slots = dropSlotsFor(ctx, 'c')
    const gap = slots.find((s) => s.kind === 'gap' && s.parentId === 'root')
    expect(dropTargetAt({ x: gap.x + 4, y: gap.y + 4 }, slots)).toMatchObject({ kind: 'gap' })
  })

  it('is null well beyond reach, so a stray drag changes nothing', () => {
    const slots = dropSlotsFor(contextWithout(tree(), 'c'), 'c')
    expect(dropTargetAt({ x: 99999, y: 99999 }, slots)).toBeNull()
    // Just past one node's own slots, with nothing else in range either.
    const gap = slots.find((s) => s.kind === 'gap' && s.parentId === 'b1')
    expect(dropTargetAt({ x: gap.x + DROP_CAPTURE + 5, y: gap.y }, [gap])).toBeNull()
  })
})

describe('indicatorFor', () => {
  it('draws a bar at a gap and a ring round a parent', () => {
    const ctx = contextWithout(tree(), 'c')
    const slots = dropSlotsFor(ctx, 'c')
    const gap = slots.find((s) => s.kind === 'gap')
    const onto = slots.find((s) => s.kind === 'onto' && s.parentId === 'a')
    expect(indicatorFor(gap, ctx)).toMatchObject({ kind: 'bar', y1: gap.y, y2: gap.y })
    expect(indicatorFor(onto, ctx)).toMatchObject({ kind: 'ring', x: 300, y: 100 })
  })

  it('is null with no slot', () => {
    expect(indicatorFor(null, contextWithout(tree(), 'c'))).toBeNull()
  })
})

describe('orderForSlot', () => {
  const siblings = [mmNode('x', 'root', 0, 0, 0), mmNode('y', 'root', 0, 0, 1)]

  it('sorts the node into the requested position', () => {
    expect(orderForSlot(siblings, 0)).toBeLessThan(0)
    expect(orderForSlot(siblings, 1)).toBeGreaterThan(0)
    expect(orderForSlot(siblings, 1)).toBeLessThan(1)
    expect(orderForSlot(siblings, 2)).toBeGreaterThan(1)
  })

  it('starts at zero for an empty sibling group', () => {
    expect(orderForSlot([], 0)).toBe(0)
  })
})

describe('siblingsForSlot', () => {
  it('counts the target parent children, minus the one being dragged', () => {
    const shapes = tree()
    const ctx = contextWithout(shapes, 'c')
    const slot = { kind: 'gap', parentId: 'root', side: 'right', index: 0 }
    expect(siblingsForSlot(shapes, slot, ctx, 'c').map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('dropPatches', () => {
  it('re-parents the node and carries its subtree along', () => {
    const shapes = tree()
    const slot = { kind: 'onto', parentId: 'a' }
    const { nodes } = dropPatches(shapes, 'b', slot)
    expect(nodes[0]).toMatchObject({ id: 'b', parentId: 'a', depth: 2 })
    expect(nodes.find((n) => n.id === 'b1')).toMatchObject({ depth: 3 })
  })

  it('re-orders within the same parent without changing it', () => {
    const shapes = tree()
    const ctx = contextWithout(shapes, 'c')
    const slot = { kind: 'gap', parentId: 'root', side: 'right', index: 0 }
    const [moved] = dropPatches(shapes, 'c', slot).nodes
    expect(moved.parentId).toBe('root')
    expect(moved.order).toBeLessThan(shapes.find((s) => s.id === 'a').mindmap.order)
    expect(ctx.boxes.a).toBeTruthy()
  })

  it('gives the moved branch the side of its new parent', () => {
    const shapes = [...tree(), mmNode('leftBranch', 'root', -400, 200, 3, 'left')]
    const { nodes } = dropPatches(shapes, 'c', { kind: 'onto', parentId: 'leftBranch' })
    expect(nodes[0].side).toBe('left')
  })

  it('is empty for a slot whose parent is not on the canvas', () => {
    expect(dropPatches(tree(), 'c', { kind: 'onto', parentId: 'gone' }).nodes).toEqual([])
  })
})

describe('isNoOpDrop', () => {
  it('rejects a drop back into the slot the node already occupies', () => {
    const shapes = tree()
    // 'b' sits between 'a' and 'c': among the remaining siblings that is index 1.
    expect(isNoOpDrop(shapes, 'b', { kind: 'gap', parentId: 'root', side: 'right', index: 1 })).toBe(true)
  })

  it('accepts a real move within the same parent', () => {
    const shapes = tree()
    expect(isNoOpDrop(shapes, 'b', { kind: 'gap', parentId: 'root', side: 'right', index: 0 })).toBe(false)
  })

  it('accepts any re-parent', () => {
    expect(isNoOpDrop(tree(), 'c', { kind: 'onto', parentId: 'a' })).toBe(false)
  })

  it('rejects dropping the last child onto the parent it already ends', () => {
    expect(isNoOpDrop(tree(), 'c', { kind: 'onto', parentId: 'root' })).toBe(true)
  })

  it('rejects a drag that found no slot at all', () => {
    expect(isNoOpDrop(tree(), 'c', null)).toBe(true)
  })

  // Same parent, same ordinal, other side of the root: the node ends up somewhere
  // visibly different, so the drop has to land.
  it('accepts a move across the root to the other side', () => {
    const shapes = [...tree(), mmNode('left', 'root', -400, 100, 3, 'left')]
    const slot = { kind: 'gap', parentId: 'root', side: 'right', index: 0 }
    expect(isNoOpDrop(shapes, 'left', slot)).toBe(false)
  })
})


