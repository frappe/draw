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
  ADD_HIT_R,
  handleAtPoint,
  nextHoverTarget,
  previewBoxFor,
  hoverStripsOf,
} from './mindmapHandles.js'
import { ROLE, flattenSubmodels } from './freeFloating.js'
import { createMindMap, addChild } from './mindmapModel.js'
import { mindmapNodeSize, NODE_FONT_SIZE } from './mindmapNodeSize.js'

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

// #427 item 2: the affordance used to be tinted with the parent's custom colour,
// promising a colour the created node never has. The ghost is the honest version:
// the default box, at the slot the handle marks.
describe('previewBoxFor', () => {
  it('stands one column out on the handle side, centred on the slot', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('right', ctx) // node spans x 300..440, mid-y 120
    const box = previewBoxFor(handle, ctx)
    expect(box.x).toBeGreaterThan(440)
    // Whole-pixel box with an odd height, so the centre lands within half a unit.
    expect(Math.abs(box.y + box.h / 2 - handle.cy)).toBeLessThanOrEqual(0.5)
  })

  it('mirrors to the left of a left-branch node', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('left', ctx) // node spans x -300..-160
    expect(previewBoxFor(handle, ctx).x + previewBoxFor(handle, ctx).w).toBeLessThan(-300)
  })

  // The ghost has to be the size a click actually produces: a new node renders at
  // NODE_FONT_SIZE, so measuring it at the base size drew a box 20px too narrow.
  it('is the size a created node really gets, not the base-font size', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('root', ctx) // root is 120x44
    const real = mindmapNodeSize({ text: '', fontSize: NODE_FONT_SIZE })
    expect(previewBoxFor(handle, ctx)).toMatchObject(real)
    expect(real).not.toEqual(mindmapNodeSize({ text: '' }))
  })

  it('is null for a handle whose node has gone', () => {
    const ctx = buildContext(sampleTree())
    const [handle] = handlesForNode('right', ctx)
    expect(previewBoxFor({ ...handle, nodeId: 'gone' }, ctx)).toBeNull()
  })
})

// #427 item 1: the corridor is painted so the pointer never crosses dead canvas on
// its way to a "+" — but it must not cover the node, whose own cursor zones say
// "click here to edit" (#123).
describe('hoverStripsOf', () => {
  it('covers the reach on each side without covering the node box', () => {
    const ctx = buildContext(sampleTree())
    const box = ctx.boxes.root
    const strips = hoverStripsOf('root', ctx)
    expect(strips.length).toBe(2)
    for (const strip of strips) {
      const overlapsNode = strip.x < box.x + box.w && box.x < strip.x + strip.w
      expect(overlapsNode).toBe(false)
    }
  })

  it('reaches past the furthest handle on the branch side', () => {
    const ctx = buildContext(sampleTree())
    const handle = handlesForNode('right', ctx)[0]
    const strip = hoverStripsOf('right', ctx).find((s) => s.x > ctx.boxes.right.x)
    expect(strip.x + strip.w).toBeGreaterThanOrEqual(handle.cx + ADD_HIT_R)
  })

  it('is empty for a node that is not on the canvas', () => {
    expect(hoverStripsOf('gone', buildContext(sampleTree()))).toEqual([])
  })
})
