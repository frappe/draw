import { describe, it, expect } from 'vitest'
import {
  ADD_R,
  ADD_OFFSET,
  GLYPH,
  HOVER_OUT,
  buildContext,
  handlesForNode,
  shouldShowHandles,
  nodeAtPoint,
  hoverRegionOf,
  pointInBox,
} from './flowchartHandles.js'
import { ROLE, flattenSubmodels } from './freeFloating.js'
import { createFlowchart, addFlowchartNode, addFlowchartEdge } from './flowchartModel.js'

// A migrated flowchart node is an ordinary shape tagged role 'flowchart-node' with
// an absolute x/y/w/h and a flowchart.nodeType. These helpers build them with known
// boxes so the "+" placement can be asserted to the pixel, independent of layout.
function fcNode(id, x, y, w = 160, h = 72, nodeType = 'process', extra = {}) {
  return {
    id,
    type: 'rounded',
    x,
    y,
    w,
    h,
    zIndex: 1,
    fill: '#FFFFFF',
    border: { color: '#525252', width: 1.5, dash: 'solid' },
    text: { content: id, align: 'center', valign: 'middle', style: {} },
    role: ROLE.flowchartNode,
    flowchart: {
      nodeType,
      branches: nodeType === 'decision' ? [{ port: 'yes', label: 'Yes' }, { port: 'no', label: 'No' }] : [],
      ...extra,
    },
  }
}

// A plain (non-flowchart) block shape, to prove the overlay ignores it.
function block(id, x, y, w, h, zIndex = 1) {
  return { id, type: 'rectangle', x, y, w, h, zIndex }
}

describe('geometry constants match the mind-map handles', () => {
  it('keeps the "+" size and spacing', () => {
    expect(ADD_R).toBe(11)
    expect(ADD_OFFSET).toBe(28)
    expect(GLYPH).toBe(4.5)
    // Far edge of the "+" is ADD_OFFSET + ADD_R below the node; +12 gives the margin.
    expect(HOVER_OUT).toBe(ADD_OFFSET + ADD_R + 12)
  })
})

describe('buildContext', () => {
  it('indexes only migrated flowchart shapes, by id, with absolute boxes', () => {
    const ctx = buildContext([fcNode('a', 0, 0, 160, 72), block('blk', 10, 10, 50, 50)])
    expect(Object.keys(ctx.boxes)).toEqual(['a'])
    expect(ctx.boxes['a']).toEqual({ x: 0, y: 0, w: 160, h: 72 })
  })

  it('is empty for a canvas with no flowchart shapes', () => {
    expect(buildContext([block('blk', 0, 0, 50, 50)]).boxes).toEqual({})
    expect(buildContext([]).boxes).toEqual({})
    expect(buildContext(undefined).boxes).toEqual({})
  })
})

describe('handlesForNode', () => {
  it('gives a node a single "+" at its bottom-centre exit, one drop below', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const handles = handlesForNode('a', ctx)
    expect(handles).toHaveLength(1)
    const [handle] = handles
    expect(handle.kind).toBe('child')
    expect(handle.nodeId).toBe('a')
    // Exit is bottom-centre (x 180, y 272); the "+" hangs ADD_OFFSET below it, and
    // the stub leaves the node from the exit point.
    expect(handle).toMatchObject({ cx: 180, cy: 272 + ADD_OFFSET, stubX: 180, stubY: 272 })
  })

  it('places the "+" clear of the node box (no overlap with the bottom edge)', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const [handle] = handlesForNode('a', ctx)
    const nodeBottom = 272
    // The top of the circle sits below the node edge by exactly ADD_OFFSET - ADD_R.
    expect(handle.cy - ADD_R).toBeGreaterThan(nodeBottom)
    expect(handle.cy - ADD_R - nodeBottom).toBe(ADD_OFFSET - ADD_R)
  })

  it('puts a decision node\'s "+" at the diamond bottom vertex (still bottom-centre)', () => {
    // portPoint(decision, 'out', 'TB') resolves to the box's bottom-centre — the
    // diamond's bottom vertex — so one formula covers every node type.
    const ctx = buildContext([fcNode('d', 0, 0, 150, 96, 'decision')])
    const [handle] = handlesForNode('d', ctx)
    expect(handle).toMatchObject({ cx: 75, cy: 96 + ADD_OFFSET, stubX: 75, stubY: 96 })
  })

  it('returns nothing for a non-flowchart / unknown id', () => {
    const ctx = buildContext([fcNode('a', 0, 0)])
    expect(handlesForNode('missing', ctx)).toEqual([])
  })

  it('round-trips through the real migration (flatten → handles below the box)', () => {
    // A genuinely migrated flowchart: boxes come from the flatten, not hand values.
    const model = createFlowchart('TB')
    const a = addFlowchartNode(model, 'process', 'Step A', 40, 40)
    const b = addFlowchartNode(model, 'process', 'Step B', 40, 240)
    addFlowchartEdge(model, a, b)
    const out = flattenSubmodels(docWith({ flowchart: model }))
    const ctx = buildContext(out.shapes)

    const handles = handlesForNode(a, ctx)
    expect(handles).toHaveLength(1)
    const [handle] = handles
    const box = ctx.boxes[a]
    // Centred on the box and one drop below its bottom edge.
    expect(handle.cx).toBe(box.x + box.w / 2)
    expect(handle.cy).toBe(box.y + box.h + ADD_OFFSET)
    expect(handle.cy).toBeGreaterThan(box.y + box.h)
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
  it('returns the flowchart node under the point, topmost by zIndex', () => {
    const shapes = [fcNode('a', 0, 0, 100, 100)]
    expect(nodeAtPoint({ x: 50, y: 50 }, shapes)).toBe('a')
    // Empty space outside the box.
    expect(nodeAtPoint({ x: 300, y: 300 }, shapes)).toBeNull()
  })

  it('ignores non-flowchart shapes and picks the higher zIndex on overlap', () => {
    const shapes = [
      fcNode('under', 0, 0, 100, 100),
      { ...fcNode('over', 10, 10, 40, 40), zIndex: 9 },
      block('blk', 0, 0, 100, 100, 99),
    ]
    expect(nodeAtPoint({ x: 20, y: 20 }, shapes)).toBe('over')
  })
})

describe('hoverRegionOf', () => {
  it('extends below the node to cover the "+", a hair on the sides', () => {
    const ctx = buildContext([fcNode('a', 100, 200, 160, 72)])
    const region = hoverRegionOf('a', ctx)
    const box = ctx.boxes['a']
    expect(region).toEqual({ x: box.x - 6, y: box.y - 8, w: box.w + 12, h: box.h + HOVER_OUT })
    // The "+" centre and its circle's bottom edge both fall inside the region.
    const [handle] = handlesForNode('a', ctx)
    expect(pointInBox({ x: handle.cx, y: handle.cy }, region)).toBe(true)
    expect(pointInBox({ x: handle.cx, y: handle.cy + ADD_R }, region)).toBe(true)
  })

  it('is null for an unknown id', () => {
    const ctx = buildContext([fcNode('a', 0, 0)])
    expect(hoverRegionOf('missing', ctx)).toBeNull()
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
