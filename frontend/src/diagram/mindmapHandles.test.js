import { describe, it, expect } from 'vitest'
import {
  ADD_R,
  ADD_OFFSET,
  GLYPH,
  HOVER_OUT,
  buildContext,
  branchSideOf,
  childCount,
  handlesForNode,
  shouldShowHandles,
  handleOwnerOf,
  nodeAtPoint,
  hoverRegionOf,
  pointInBox,
  ADD_HIT_R,
  HANDLE_INSET,
  handleAtPoint,
  nextHoverTarget,
  slotAtPoint,
} from './mindmapHandles.js'
import { ROLE, flattenSubmodels } from './freeFloating.js'
import { createMindMap, addChild } from './mindmapModel.js'

// A migrated mind-map node is an ordinary shape tagged with role 'mindmap-node' and
// a mindmap.parentId. These helpers build them with known boxes so placement can be
// asserted to the pixel, independent of the auto-layout.
function mmNode(id, parentId, x, y, w = 140, h = 40, extra = {}) {
  return {
    id,
    type: 'rounded',
    x,
    y,
    w,
    h,
    zIndex: 1,
    fill: '#EAF4FB',
    border: { color: '#2D9CDB', width: parentId ? 1.5 : 2, dash: 'solid' },
    text: { content: id, align: 'center', valign: 'middle', style: {} },
    role: ROLE.mindmapNode,
    mindmap: { parentId: parentId || null, order: 0, depth: parentId ? 1 : 0, ...extra },
  }
}

// Root at (0,100) 120x44 → centre x = 60; a child to the right, one to the left.
function sampleTree() {
  return [
    mmNode('root', null, 0, 100, 120, 44),
    mmNode('right', 'root', 300, 100, 140, 40),
    mmNode('left', 'root', -300, 100, 140, 40),
  ]
}

// A right-branch parent 'p' with `n` children stacked top→bottom below it, so one
// side carries a known number of children (for the N+1 gap-handle count).
function nodeWithChildren(n) {
  const shapes = [mmNode('root', null, 0, 100, 120, 44), mmNode('p', 'root', 300, 100, 140, 40)]
  for (let i = 0; i < n; i += 1) shapes.push(mmNode(`c${i}`, 'p', 600, 60 + i * 60, 140, 40))
  return shapes
}

describe('geometry constants', () => {
  it('keeps the "+" sizes and reach', () => {
    expect(ADD_R).toBe(7)
    expect(ADD_OFFSET).toBe(28)
    expect(GLYPH).toBe(3.5)
    expect(HOVER_OUT).toBe(ADD_OFFSET + ADD_HIT_R + 12)
  })

  // #427 items 1 and 7: the mark got smaller, the target bigger. One radius could
  // only trade those against each other, so they are separate numbers now.
  it('gives the "+" a target larger than the mark it draws', () => {
    expect(ADD_HIT_R).toBeGreaterThan(ADD_R)
  })

  // #511: the "+" was hard to hit. Only the invisible target moves — raising the
  // drawn radius is the trade the two-number split was introduced to end.
  it('keeps the drawn mark small while the target is comfortable', () => {
    expect(ADD_R).toBe(7)
    expect(ADD_HIT_R).toBe(20)
  })
})

describe('branchSideOf', () => {
  it('reads a node against its own root centre', () => {
    const ctx = buildContext(sampleTree())
    expect(branchSideOf('root', ctx)).toBe('right') // root defaults right
    expect(branchSideOf('right', ctx)).toBe('right')
    expect(branchSideOf('left', ctx)).toBe('left')
  })

  it('uses each tree independently on a multi-tree map (#48)', () => {
    // A second tree far to the right; its child sits left of ITS root but right of
    // the whole map — side must be judged against tree B's root, not tree A's.
    const shapes = [
      ...sampleTree(),
      mmNode('rootB', null, 1000, 100, 120, 44), // centre 1060
      mmNode('bLeft', 'rootB', 800, 100, 140, 40), // centre 870 < 1060 → left
    ]
    const ctx = buildContext(shapes)
    expect(branchSideOf('bLeft', ctx)).toBe('left')
  })
})

// Gap-insertion handles (#265): N children on a side → N+1 "+" handles, one in each
// slot a new child could occupy (above the top, below the bottom, between each pair).
describe('handlesForNode', () => {
  it('gives a childless node one straight "+" at its mid-height', () => {
    const ctx = buildContext(sampleTree())
    const handles = handlesForNode('right', ctx) // 'right' is childless
    expect(handles).toHaveLength(1)
    // Straight stub, level with the node edge, on the branch side, 28px past the edge.
    expect(handles[0]).toMatchObject({
      index: 0,
      side: 'right',
      straight: true,
      cx: 440 + ADD_OFFSET,
      cy: 120,
      stubX: 440,
      stubY: 120,
    })
  })

  it('gives a one-child side two curved handles, above and below the child', () => {
    const ctx = buildContext(treeWithGrandchild())
    const handles = handlesForNode('right', ctx) // 'right' has one child, 'grand'
    expect(handles).toHaveLength(2)
    expect(handles.every((h) => h.straight === false)).toBe(true)
    const grand = ctx.boxes['grand']
    const grandCentre = grand.y + grand.h / 2
    expect(handles[0].cy).toBeLessThan(grandCentre) // above
    expect(handles[1].cy).toBeGreaterThan(grandCentre) // below
    // The stub always leaves the node's OWN edge at its mid-height, whatever the gap y.
    expect(handles.every((h) => h.stubX === 440 && h.stubY === 120)).toBe(true)
    // #427: a gap handle stands in the CHILD column, not beside the parent. Every
    // branch leaves the parent from one point, so a "+" parked there sits on the
    // bundle of curves; out by the children, each curve has reached its own child.
    const grandBox = ctx.boxes['grand']
    expect(handles.every((h) => h.cx > 440 + ADD_OFFSET)).toBe(true)
    expect(handles.every((h) => h.cx + ADD_R < grandBox.x)).toBe(true)
  })

  it('keeps a gap "+" clear of the child box it precedes', () => {
    const ctx = buildContext(nodeWithChildren(3))
    const children = ['c0', 'c1', 'c2'].map((id) => ctx.boxes[id])
    const columnEdge = Math.min(...children.map((child) => child.x))
    for (const handle of handlesForNode('p', ctx)) {
      expect(columnEdge - (handle.cx + ADD_R)).toBeGreaterThanOrEqual(HANDLE_INSET - ADD_R)
    }
  })

  it('never lets a gap column crowd the parent, however close the children are', () => {
    const shapes = [mmNode('root', null, 0, 100, 120, 44), mmNode('p', 'root', 300, 100, 140, 40)]
    // Children pulled hard against their parent — closer than the handle column wants.
    shapes.push(mmNode('c0', 'p', 448, 60, 140, 40), mmNode('c1', 'p', 448, 140, 140, 40))
    const ctx = buildContext(shapes)
    for (const handle of handlesForNode('p', ctx)) {
      expect(handle.cx).toBeGreaterThanOrEqual(440 + ADD_OFFSET)
    }
  })

  it('shows N+1 handles for N children on a side', () => {
    expect(handlesForNode('p', buildContext(nodeWithChildren(0)))).toHaveLength(1)
    expect(handlesForNode('p', buildContext(nodeWithChildren(1)))).toHaveLength(2)
    expect(handlesForNode('p', buildContext(nodeWithChildren(2)))).toHaveLength(3)
    expect(handlesForNode('p', buildContext(nodeWithChildren(3)))).toHaveLength(4)
  })

  it('interleaves the handle y\'s with the children (H,C,H,…,H)', () => {
    const ctx = buildContext(nodeWithChildren(3))
    const handleYs = handlesForNode('p', ctx).map((h) => ['H', h.cy])
    const childYs = ['c0', 'c1', 'c2'].map((id) => ['C', ctx.boxes[id].y + ctx.boxes[id].h / 2])
    const merged = [...handleYs, ...childYs].sort((a, b) => a[1] - b[1])
    expect(merged.map((m) => m[0]).join('')).toBe('HCHCHCH')
  })

  it('numbers the handles 0..N top→bottom and tags them with the side', () => {
    const ctx = buildContext(nodeWithChildren(3))
    const handles = handlesForNode('p', ctx)
    expect(handles.map((h) => h.index)).toEqual([0, 1, 2, 3])
    expect(handles.every((h) => h.side === 'right')).toBe(true)
    // Each key is unique so Vue can track them.
    expect(new Set(handles.map((h) => h.key)).size).toBe(handles.length)
  })

  it('gives a root a gap column on BOTH sides, a non-root only on its branch side', () => {
    const ctx = buildContext(sampleTree())
    const root = handlesForNode('root', ctx)
    expect(new Set(root.map((h) => h.side))).toEqual(new Set(['left', 'right']))
    // One child per side → two handles per side (above + below).
    expect(root.filter((h) => h.side === 'right')).toHaveLength(2)
    expect(root.filter((h) => h.side === 'left')).toHaveLength(2)
    // A non-root node only ever offers its own branch side.
    expect(handlesForNode('right', ctx).every((h) => h.side === 'right')).toBe(true)
    expect(handlesForNode('left', ctx).every((h) => h.side === 'left')).toBe(true)
  })

  it('mirrors the left branch past the node\'s left edge', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('left', ctx) // left node spans x -300..-160
    expect(handle).toMatchObject({ side: 'left', cx: -300 - ADD_OFFSET, cy: 120, stubX: -300, stubY: 120 })
  })

  it('places the "+" clear of the node box (no overlap with the border)', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('right', ctx)
    const nodeRightEdge = 440
    expect(handle.cx - ADD_R).toBeGreaterThan(nodeRightEdge)
    expect(handle.cx - ADD_R - nodeRightEdge).toBe(ADD_OFFSET - ADD_R)
  })

  it('returns nothing for a non-mindmap / unknown id', () => {
    const ctx = buildContext(sampleTree())
    expect(handlesForNode('missing', ctx)).toEqual([])
  })

  it('round-trips through the real migration (flatten → handles)', () => {
    // A genuinely migrated map: side/geometry come from the layout, not hand boxes.
    const model = createMindMap('Root')
    const a = addChild(model, model.rootId, 'Alpha', 'right')
    addChild(model, model.rootId, 'Beta', 'left')
    const out = flattenSubmodels(docWith({ mindmap: model }))
    const ctx = buildContext(out.shapes, out.connectors)

    // The root grows a gap column on both sides.
    expect(new Set(handlesForNode(model.rootId, ctx).map((h) => h.side))).toEqual(new Set(['left', 'right']))
    // 'Alpha' is childless, so it offers a single straight "+" to the right of its box.
    const [handle] = handlesForNode(a, ctx)
    expect(handle.straight).toBe(true)
    const box = ctx.boxes[a]
    expect(handle.cx).toBeGreaterThan(box.x + box.w)
  })
})

// sampleTree() with a grandchild hung off 'right', so 'right' now has one child of
// its own while 'left' and the grandchild stay childless.
function treeWithGrandchild() {
  return [...sampleTree(), mmNode('grand', 'right', 600, 100, 140, 40)]
}

describe('childCount', () => {
  it('counts the nodes that hang directly off a node', () => {
    const ctx = buildContext(treeWithGrandchild())
    expect(childCount('root', ctx)).toBe(2) // right + left
    expect(childCount('right', ctx)).toBe(1) // grand
    expect(childCount('left', ctx)).toBe(0)
    expect(childCount('grand', ctx)).toBe(0)
  })
})

describe('shouldShowHandles', () => {
  it('shows while hovered OR while the sole selection, under the select tool (#261)', () => {
    expect(shouldShowHandles({ selectTool: true, hovered: true })).toBe(true)
    // #261: a selected node now surfaces its add CTAs, not only a hovered one.
    expect(shouldShowHandles({ selectTool: true, soleSelected: true })).toBe(true)
    // Neither hovered nor selected: nothing shows.
    expect(shouldShowHandles({ selectTool: true })).toBe(false)
    // Never while another tool is armed.
    expect(shouldShowHandles({ selectTool: false, hovered: true })).toBe(false)
    expect(shouldShowHandles({ selectTool: false, soleSelected: true })).toBe(false)
    expect(shouldShowHandles()).toBe(false)
  })

  // #510: a node being named is not asking for a child yet. Beats both halves of
  // the rule — a new child is selected AND sits under the pointer that added it.
  it('shows nothing while the node is being named (#510)', () => {
    expect(shouldShowHandles({ selectTool: true, hovered: true, editing: true })).toBe(false)
    expect(shouldShowHandles({ selectTool: true, soleSelected: true, editing: true })).toBe(false)
  })

  it('brings the handles back once the name is committed', () => {
    expect(shouldShowHandles({ selectTool: true, hovered: true, editing: false })).toBe(true)
  })
})

// #515/#516: which node gets to ask. The predicate above is per-node and both its
// halves could pass on DIFFERENT nodes at once, so the single winner is picked here.
describe('handleOwnerOf', () => {
  const boxes = { a: { x: 0, y: 0, w: 10, h: 10 }, b: { x: 20, y: 0, w: 10, h: 10 } }

  it('gives the handles to the hovered node', () => {
    expect(handleOwnerOf({ hoveredId: 'a', selection: [], boxes })).toEqual({ id: 'a', hovered: true })
  })

  // The screenshot in #515: the pointer on one node, another still selected from
  // having just been added, and both drawing their marks.
  it('lets hover beat a different node being selected', () => {
    expect(handleOwnerOf({ hoveredId: 'a', selection: ['b'], boxes })).toEqual({ id: 'a', hovered: true })
  })

  // #516: the pointer nowhere near, yet the selected node kept its "+" up.
  it('falls back to the sole selection only when nothing is hovered', () => {
    expect(handleOwnerOf({ hoveredId: null, selection: ['b'], boxes })).toEqual({ id: 'b', hovered: false })
  })

  it('offers nothing for a multi-selection or an empty one', () => {
    expect(handleOwnerOf({ hoveredId: null, selection: ['a', 'b'], boxes })).toBeNull()
    expect(handleOwnerOf({ hoveredId: null, selection: [], boxes })).toBeNull()
    expect(handleOwnerOf()).toBeNull()
  })

  // A selected shape that is not a mind-map node has no boxes entry, so it cannot
  // claim a column of "+" marks it would have nowhere to put.
  it('ignores a selection that is not a mind-map node', () => {
    expect(handleOwnerOf({ hoveredId: null, selection: ['sticky'], boxes })).toBeNull()
  })
})

describe('nodeAtPoint', () => {
  it('returns the mind-map node under the point, topmost by zIndex', () => {
    const shapes = sampleTree()
    expect(nodeAtPoint({ x: 60, y: 120 }, shapes)).toBe('root')
    expect(nodeAtPoint({ x: 360, y: 120 }, shapes)).toBe('right')
    // Empty space between the trees.
    expect(nodeAtPoint({ x: 700, y: 120 }, shapes)).toBeNull()
  })

  it('ignores non-mindmap shapes and picks the higher zIndex on overlap', () => {
    const shapes = [
      mmNode('under', null, 0, 0, 100, 100),
      { ...mmNode('over', null, 10, 10, 40, 40), zIndex: 9 },
      { id: 'block', type: 'rectangle', x: 0, y: 0, w: 100, h: 100, zIndex: 99 },
    ]
    expect(nodeAtPoint({ x: 20, y: 20 }, shapes)).toBe('over')
  })
})

describe('hoverRegionOf', () => {
  it('reaches out on the branch side and spans the whole gap column with margin (#264)', () => {
    const ctx = buildContext(treeWithGrandchild())
    const region = hoverRegionOf('right', ctx)
    const box = ctx.boxes['right']
    // Only a hair on the non-branch side; on the branch side it reaches however far
    // the handles actually stand, which is out by the children (#427).
    expect(region.x).toBeLessThanOrEqual(box.x - 6)
    expect(region.x + region.w).toBeGreaterThanOrEqual(box.x + box.w + HOVER_OUT)
    // Covers the extreme handle y's — the top ("above the child") and bottom ("below
    // the child") — with margin, so the pointer never drops the hover in the gap.
    const cys = handlesForNode('right', ctx).map((h) => h.cy)
    expect(region.y).toBeLessThan(Math.min(...cys) - ADD_R)
    expect(region.y + region.h).toBeGreaterThan(Math.max(...cys) + ADD_R)
    for (const h of handlesForNode('right', ctx)) {
      expect(pointInBox({ x: h.cx, y: h.cy }, region)).toBe(true)
    }
  })

  it('a root reaches out on both sides and covers both columns', () => {
    const ctx = buildContext(sampleTree())
    const region = hoverRegionOf('root', ctx)
    const box = ctx.boxes['root']
    // At least the base reach on each side, and further wherever the handles stand.
    expect(region.x).toBeLessThanOrEqual(box.x - HOVER_OUT)
    expect(region.x + region.w).toBeGreaterThanOrEqual(box.x + box.w + HOVER_OUT)
    for (const h of handlesForNode('root', ctx)) {
      expect(pointInBox({ x: h.cx, y: h.cy }, region)).toBe(true)
    }
  })
})

describe('pointInBox', () => {
  it('is inclusive on the edges and false for a null box', () => {
    const box = { x: 0, y: 0, w: 10, h: 10 }
    expect(pointInBox({ x: 0, y: 0 }, box)).toBe(true)
    expect(pointInBox({ x: 10, y: 10 }, box)).toBe(true)
    expect(pointInBox({ x: 11, y: 5 }, box)).toBe(false)
    expect(pointInBox({ x: 5, y: 5 }, null)).toBe(false)
  })
})

// Matches the doc shape the migration expects (mirrors freeFloatingGraph.test.js).
function docWith(partial) {
  return {
    schemaVersion: 2,
    diagramType: 'unified',
    canvas: { width: 1920, height: 1080, background: null },
    shapes: [],
    connectors: [],
    sections: [],
    mindmap: null,
    flowchart: null,
    whiteboard: null,
    ...partial,
  }
}

// #427 item 1. The "+" used to disappear as the pointer travelled toward it: any
// node box the pointer crossed stole the hover outright, and leaving the node's
// own element counted as leaving. Hover ownership is decided here now.
describe('handleAtPoint', () => {
  it('hits a handle anywhere inside the target radius, not just on the mark', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('right', ctx)
    const offCentre = { x: handle.cx + ADD_HIT_R - 1, y: handle.cy }
    expect(handleAtPoint(offCentre, 'right', ctx)?.key).toBe(handle.key)
  })

  it('misses beyond the target radius', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('right', ctx)
    expect(handleAtPoint({ x: handle.cx + ADD_HIT_R + 2, y: handle.cy }, 'right', ctx)).toBeNull()
  })

  it('is null for a node that offers no handles', () => {
    const ctx = buildContext(sampleTree())
    expect(handleAtPoint({ x: 0, y: 0 }, 'nope', ctx)).toBeNull()
  })

  // #511: the target grew, so a click must land on the handle it was aimed at
  // whatever order the handles come in.
  it('answers with the handle under the point, at any position in the list', () => {
    const ctx = buildContext(nodeWithChildren(5))
    for (const handle of handlesForNode('p', ctx)) {
      expect(handleAtPoint({ x: handle.cx, y: handle.cy }, 'p', ctx)?.key).toBe(handle.key)
    }
  })
})

// The other half of #511: a bigger target is only usable if two of them do not sit
// on top of each other. The minimum separation placement enforces is derived from
// the HIT radius now rather than the drawn one, so it can no longer let a
// neighbour's target reach this handle's own mark. In a laid-out tree the child
// spacing keeps the marks further apart than that floor anyway — this pins that,
// so a future change to the layout or to either radius cannot quietly bring back
// targets a user has to aim between.
describe('handle spacing', () => {
  it('never places two targets close enough to overlap, even in a packed tree', () => {
    for (const pitch of [44, 48, 60]) {
      for (const count of [2, 5, 9]) {
        const shapes = [mmNode('root', null, 0, 100, 120, 44), mmNode('p', 'root', 300, 100, 140, 40)]
        for (let i = 0; i < count; i += 1) shapes.push(mmNode(`c${i}`, 'p', 600, 60 + i * pitch, 140, 40))
        const handles = handlesForNode('p', buildContext(shapes))
        for (let i = 1; i < handles.length; i += 1) {
          const gap = Math.hypot(handles[i].cx - handles[i - 1].cx, handles[i].cy - handles[i - 1].cy)
          expect(gap).toBeGreaterThanOrEqual(ADD_HIT_R * 2)
        }
      }
    }
  })
})

describe('nextHoverTarget', () => {
  it('keeps the hover on the node whose handle the pointer is over', () => {
    const shapes = sampleTree()
    const ctx = buildContext(shapes)
    const [handle] = handlesForNode('root', ctx)
    const target = nextHoverTarget({ point: { x: handle.cx, y: handle.cy }, currentId: 'root', ctx, shapes })
    expect(target).toBe('root')
  })

  // The regression itself: a handle drawn over a neighbouring node's box still
  // belongs to the node that offered it.
  it('does not hand the hover to a node sitting under the current node handle', () => {
    const shapes = sampleTree()
    const ctx = buildContext(shapes)
    const [handle] = handlesForNode('root', ctx)
    // Park an unrelated node (its own tree) right on top of that handle.
    shapes.push(mmNode('intruder', null, handle.cx - 20, handle.cy - 20, 40, 40))
    const moved = buildContext(shapes)
    const point = { x: handle.cx, y: handle.cy }
    expect(nextHoverTarget({ point, currentId: 'root', ctx: moved, shapes })).toBe('root')
    // With no node hovered yet, the box under the pointer wins as before.
    expect(nextHoverTarget({ point, currentId: null, ctx: moved, shapes })).toBe('intruder')
  })

  it('takes the node directly under the pointer', () => {
    const shapes = sampleTree()
    const ctx = buildContext(shapes)
    expect(nextHoverTarget({ point: { x: 350, y: 120 }, currentId: null, ctx, shapes })).toBe('right')
  })

  it('holds the hover inside the padded region, with nothing under the pointer', () => {
    const shapes = sampleTree()
    const ctx = buildContext(shapes)
    const region = hoverRegionOf('right', ctx)
    const inCorridor = { x: region.x + region.w - 2, y: region.y + region.h / 2 }
    expect(nodeAtPoint(inCorridor, shapes)).toBeNull()
    expect(nextHoverTarget({ point: inCorridor, currentId: 'right', ctx, shapes })).toBe('right')
  })

  it('drops the hover once the pointer leaves the region entirely', () => {
    const shapes = sampleTree()
    const ctx = buildContext(shapes)
    expect(nextHoverTarget({ point: { x: 5000, y: 5000 }, currentId: 'right', ctx, shapes })).toBeNull()
  })
})


// #427 item 1: the corridor is painted so the pointer never crosses dead canvas on
// its way to a "+" — but it must not cover the node, whose own cursor zones say
// "click here to edit" (#123).
// Hovering the whitespace where two branches split offers THAT slot's "+", without
// hovering the parent first — and offers only that one, not the node's whole
// column (#427). The zone is the band between the two branches, from the node's
// edge out past the mark.
describe('slotAtPoint', () => {
  const ctx = () => buildContext(nodeWithChildren(4))

  it('offers the slot whose whitespace the pointer is in', () => {
    const context = ctx()
    const [, second] = handlesForNode('p', context)
    const handle = slotAtPoint({ x: second.cx, y: second.cy }, context)
    expect(handle.key).toBe(second.key)
  })

  // The point that matters: the fork itself, back where the branches leave the
  // parent, long before the column the marks stand in.
  it('answers from the fork, not only from the mark', () => {
    const context = ctx()
    const [, second] = handlesForNode('p', context)
    const parent = context.boxes.p
    const handle = slotAtPoint({ x: parent.x + parent.w + 6, y: second.cy }, context)
    expect(handle.key).toBe(second.key)
  })

  it('picks one slot, and it is the nearest', () => {
    const context = ctx()
    const handles = handlesForNode('p', context)
    for (const handle of handles) {
      expect(slotAtPoint({ x: handle.cx, y: handle.cy }, context).key).toBe(handle.key)
    }
  })

  it('offers nothing out in open canvas', () => {
    expect(slotAtPoint({ x: 4000, y: 4000 }, ctx())).toBe(null)
  })

  // A childless node's single "+" is a slot like any other, so approaching the
  // empty side of a leaf offers it.
  it('offers a childless node its one slot', () => {
    const context = buildContext(sampleTree())
    const box = context.boxes.right
    const handle = slotAtPoint({ x: box.x + box.w + 10, y: box.y + box.h / 2 }, context)
    expect(handle.nodeId).toBe('right')
  })
})
