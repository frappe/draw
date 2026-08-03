import { describe, it, expect } from 'vitest'
import {
  ADD_R,
  ADD_OFFSET,
  SIB_DY,
  HOVER_OUT,
  buildContext,
  branchSideOf,
  childCount,
  offersAddChild,
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

describe('geometry constants match MindMapNodeLayer', () => {
  it('keeps the "+" sizes and spacing', () => {
    expect(ADD_R).toBe(11)
    expect(ADD_OFFSET).toBe(28)
    // One diameter + a 6px gap, so the child "+" and sibling "+" never overlap.
    expect(SIB_DY).toBe(ADD_R * 2 + 6)
    expect(SIB_DY - 2 * ADD_R).toBe(6)
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

describe('handlesForNode', () => {
  it('gives a root an add-child "+" on both sides and no sibling', () => {
    const ctx = buildContext(sampleTree())
    const handles = handlesForNode('root', ctx)
    expect(handles.map((h) => h.kind)).toEqual(['child', 'child'])
    const sides = handles.map((h) => h.side).sort()
    expect(sides).toEqual(['left', 'right'])
    // Right "+": centre 28px past the right edge, at mid-height; stub leaves the edge.
    const right = handles.find((h) => h.side === 'right')
    expect(right).toMatchObject({ cx: 0 + 120 + ADD_OFFSET, cy: 100 + 22, stubX: 120, stubY: 122 })
    const left = handles.find((h) => h.side === 'left')
    expect(left).toMatchObject({ cx: 0 - ADD_OFFSET, cy: 122, stubX: 0, stubY: 122 })
  })

  it('gives a right-hand child a child "+" on its side plus a sibling "+" below', () => {
    const ctx = buildContext(sampleTree())
    const handles = handlesForNode('right', ctx)
    expect(handles.map((h) => h.kind)).toEqual(['child', 'sibling'])
    const [child, sibling] = handles
    // Both on the right, past the node's right edge (x 300..440).
    expect(child).toMatchObject({ side: 'right', cx: 440 + ADD_OFFSET, cy: 120, stubX: 440, stubY: 120 })
    // Sibling sits one drop below the child "+", stub still leaves the node mid-height.
    expect(sibling).toMatchObject({ side: 'right', cx: 440 + ADD_OFFSET, cy: 120 + SIB_DY, stubX: 440, stubY: 120 })
    // The two circles clear each other vertically.
    expect(sibling.cy - child.cy).toBeGreaterThanOrEqual(2 * ADD_R)
  })

  it('mirrors everything to the left for a left-hand child', () => {
    const ctx = buildContext(sampleTree())
    const [child, sibling] = handlesForNode('left', ctx)
    // Left node spans x -300..-160; "+" sits 28px past the LEFT edge.
    expect(child).toMatchObject({ side: 'left', cx: -300 - ADD_OFFSET, cy: 120, stubX: -300, stubY: 120 })
    expect(sibling).toMatchObject({ side: 'left', cx: -300 - ADD_OFFSET, cy: 120 + SIB_DY })
  })

  it('places the "+" clear of the node box (no overlap with the border)', () => {
    const ctx = buildContext(sampleTree())
    const [child] = handlesForNode('right', ctx)
    // Nearest edge of the circle is ADD_OFFSET - ADD_R past the node edge (> 0).
    const nodeRightEdge = 440
    expect(child.cx - ADD_R).toBeGreaterThan(nodeRightEdge)
    expect(child.cx - ADD_R - nodeRightEdge).toBe(ADD_OFFSET - ADD_R)
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

    expect(handlesForNode(model.rootId, ctx).map((h) => h.kind)).toEqual(['child', 'child'])
    const childHandles = handlesForNode(a, ctx)
    expect(childHandles.map((h) => h.kind)).toEqual(['child', 'sibling'])
    // 'Alpha' was pinned right, so its handles sit to the right of its box.
    const box = ctx.boxes[a]
    expect(childHandles[0].cx).toBeGreaterThan(box.x + box.w)
  })
})

// sampleTree() with a grandchild hung off 'right', so 'right' now has a child of
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

describe('offersAddChild (#129)', () => {
  it('offers the add-child "+" until a non-root node has a child', () => {
    const ctx = buildContext(treeWithGrandchild())
    // A childless non-root still offers it; once it has a child it does not.
    expect(offersAddChild('left', ctx)).toBe(true)
    expect(offersAddChild('grand', ctx)).toBe(true)
    expect(offersAddChild('right', ctx)).toBe(false)
    // A root always offers it (both sides), children or not.
    expect(offersAddChild('root', ctx)).toBe(true)
  })
})

describe('handlesForNode after the first child (#129)', () => {
  it('offers add-child + sibling on a childless node (0 children → add child)', () => {
    const ctx = buildContext(treeWithGrandchild())
    expect(handlesForNode('left', ctx).map((h) => h.kind)).toEqual(['child', 'sibling'])
  })

  it('drops the redundant add-child once a child exists (≥1 child → only sibling)', () => {
    const ctx = buildContext(treeWithGrandchild())
    const handles = handlesForNode('right', ctx)
    expect(handles.map((h) => h.kind)).toEqual(['sibling'])
    // The one remaining "+" is the add-another-child (sibling) op, on the branch side.
    expect(handles[0]).toMatchObject({ kind: 'sibling', side: 'right' })
  })

  it('leaves a root with both add-child "+" even after it has children', () => {
    const ctx = buildContext(treeWithGrandchild())
    expect(handlesForNode('root', ctx).map((h) => h.kind)).toEqual(['child', 'child'])
  })
})

describe('shouldShowHandles', () => {
  it('shows only with the select tool, when hovered or sole-selected', () => {
    expect(shouldShowHandles({ selectTool: true, hovered: true })).toBe(true)
    expect(shouldShowHandles({ selectTool: true, soleSelected: true })).toBe(true)
    expect(shouldShowHandles({ selectTool: true })).toBe(false)
    // Never while another tool is armed, even if hovered/selected.
    expect(shouldShowHandles({ selectTool: false, hovered: true, soleSelected: true })).toBe(false)
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
  it('extends past the branch side and below the sibling "+"', () => {
    const ctx = buildContext(sampleTree())
    const region = hoverRegionOf('right', ctx)
    const box = ctx.boxes['right']
    // Reaches out on the branch (right) side to cover the "+", only a hair on the other.
    expect(region.x).toBe(box.x - 6)
    expect(region.x + region.w).toBe(box.x + box.w + HOVER_OUT)
    // Tall enough to cover the sibling "+" below the box.
    expect(region.h).toBe(box.h + SIB_DY + ADD_R + 14)
    // The child and sibling "+" centres both fall inside the region.
    for (const h of handlesForNode('right', ctx)) {
      expect(pointInBox({ x: h.cx, y: h.cy }, region)).toBe(true)
    }
  })

  it('a root reaches out on both sides', () => {
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
