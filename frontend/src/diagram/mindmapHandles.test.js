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
  nodeAtPoint,
  hoverRegionOf,
  pointInBox,
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
    expect(ADD_R).toBe(11)
    expect(ADD_OFFSET).toBe(28)
    expect(GLYPH).toBe(4.5)
    expect(HOVER_OUT).toBe(ADD_OFFSET + ADD_R + 12)
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
    expect(handles.every((h) => h.stubX === 440 && h.stubY === 120 && h.cx === 440 + ADD_OFFSET)).toBe(true)
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
    // Reaches out on the branch (right) side to cover the "+", only a hair on the other.
    expect(region.x).toBe(box.x - 6)
    expect(region.x + region.w).toBe(box.x + box.w + HOVER_OUT)
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
    expect(region.x).toBe(box.x - HOVER_OUT)
    expect(region.x + region.w).toBe(box.x + box.w + HOVER_OUT)
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
