import { describe, it, expect } from 'vitest'
import {
  createFlowchart,
  addFlowchartNode,
  addFlowchartEdge,
  flowchartNodeById,
} from './flowchartModel.js'
import {
  routeEdge,
  tidyLayout,
  reflowAuto,
  toggleDirection,
  flowchartContentBounds,
  nodeCenter,
  placeChild,
  placePicker,
} from './flowchartLayout.js'
import { nodeSize } from './flowchartModel.js'

// Build A->B->C with B branching to D in a decision, for layout tests.
function sampleChart() {
  const model = createFlowchart()
  const a = addFlowchartNode(model, 'terminator')
  const b = addFlowchartNode(model, 'process')
  const c = addFlowchartNode(model, 'process')
  addFlowchartEdge(model, a, b)
  addFlowchartEdge(model, b, c)
  return { model, a, b, c }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe('flowchart routing', () => {
  it('routes an edge as an orthogonal elbow (axis-aligned segments)', () => {
    const { model } = sampleChart()
    tidyLayout(model)
    const route = routeEdge(model, model.edges[0])
    expect(route.points.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < route.points.length - 1; i += 1) {
      const a = route.points[i]
      const b = route.points[i + 1]
      const axisAligned = a.x === b.x || a.y === b.y
      expect(axisAligned).toBe(true)
    }
  })

  it('re-routes after a node moves (route follows current positions)', () => {
    const { model, b } = sampleChart()
    tidyLayout(model)
    const before = routeEdge(model, model.edges[0]).end
    flowchartNodeById(model, b).x += 200
    const after = routeEdge(model, model.edges[0]).end
    expect(after.x).not.toBe(before.x)
  })

  // #99: a first child sits one tight LEVEL_GAP below the parent (not the old,
  // sparse 96px) so a fresh flow reads compact without manual re-arranging.
  it('placeChild drops a first child a tight gap below the parent (TB)', () => {
    const model = createFlowchart()
    const a = addFlowchartNode(model, 'process', 'A', 40, 40)
    const parent = flowchartNodeById(model, a)
    const parentSize = nodeSize(parent)
    const pos = placeChild(model, a, { nodeType: 'process', x: 0, y: 0 })
    // The vertical gap between the parent's bottom and the child's top is LEVEL_GAP.
    expect(pos.y - (parent.y + parentSize.h)).toBe(64)
  })

  // #99: two siblings sit a tight SIBLING_GAP apart, and still never overlap.
  it('placeChild spaces a second sibling a tight gap from the first (TB)', () => {
    const model = createFlowchart()
    const a = addFlowchartNode(model, 'process', 'A', 0, 0)
    const p1 = placeChild(model, a, { nodeType: 'process', x: 0, y: 0 })
    const c1 = flowchartNodeById(model, addFlowchartNode(model, 'process'))
    c1.x = p1.x
    c1.y = p1.y
    const p2 = placeChild(model, a, { nodeType: 'process', x: 0, y: 0 })
    const size = nodeSize(c1)
    // Nudged along x by exactly one box-width + SIBLING_GAP, so the gap is 44.
    expect(p2.x - (p1.x + size.w)).toBe(44)
  })

  // P9: adding a node must never drop it on top of an existing one.
  it('placeChild nudges a new child clear of an existing node', () => {
    const model = createFlowchart()
    const a = addFlowchartNode(model, 'process')
    // First child under A, materialised at its computed slot.
    const p1 = placeChild(model, a, { nodeType: 'process', x: 0, y: 0 })
    const c1 = flowchartNodeById(model, addFlowchartNode(model, 'process'))
    c1.x = p1.x
    c1.y = p1.y
    // Second child under the SAME parent lands on the same base slot — must be
    // nudged so it doesn't overlap the first.
    const p2 = placeChild(model, a, { nodeType: 'process', x: 0, y: 0 })
    const size = nodeSize(c1)
    const box1 = { x: p1.x, y: p1.y, w: size.w, h: size.h }
    const box2 = { x: p2.x, y: p2.y, w: size.w, h: size.h }
    expect(overlaps(box1, box2)).toBe(false)
  })
})

describe('flowchart tidy + reflow', () => {
  it('Tidy positions nodes in successive levels without overlap, clears manual flags', () => {
    const { model, b } = sampleChart()
    flowchartNodeById(model, b).manuallyPositioned = true
    tidyLayout(model)
    const boxes = model.nodes.map((node) => ({ ...node, ...nodeSize(node) }))
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false)
      }
    }
    expect(model.nodes.every((node) => node.manuallyPositioned === false)).toBe(true)
  })

  it('successive levels advance down the main axis in TB', () => {
    const { model, a, b, c } = sampleChart()
    tidyLayout(model)
    expect(nodeCenter(flowchartNodeById(model, a)).y).toBeLessThan(nodeCenter(flowchartNodeById(model, b)).y)
    expect(nodeCenter(flowchartNodeById(model, b)).y).toBeLessThan(nodeCenter(flowchartNodeById(model, c)).y)
  })

  it('reflowAuto leaves manually positioned nodes in place', () => {
    const { model, b } = sampleChart()
    const node = flowchartNodeById(model, b)
    node.manuallyPositioned = true
    node.x = 999
    node.y = 999
    reflowAuto(model)
    expect(node.x).toBe(999)
    expect(node.y).toBe(999)
  })

  it('reflowAuto repositions forced ids even when manual', () => {
    const { model, b } = sampleChart()
    const node = flowchartNodeById(model, b)
    node.manuallyPositioned = true
    node.x = 999
    reflowAuto(model, [b])
    expect(node.x).not.toBe(999)
  })
})

describe('flowchart direction toggle', () => {
  it('flips TB<->LR and re-lays-out so levels advance along the new axis', () => {
    const { model, a, b } = sampleChart()
    toggleDirection(model)
    expect(model.direction).toBe('LR')
    expect(nodeCenter(flowchartNodeById(model, a)).x).toBeLessThan(nodeCenter(flowchartNodeById(model, b)).x)
  })
})

// #96: the node-type picker must open close below the node and never slip behind
// the bottom palette — flipping above / clamping when there is not room below.
describe('flowchart picker placement (#96)', () => {
  const menu = { w: 256, h: 232 }
  const roomy = { x: 0, y: 0, w: 1000, h: 1000 }

  it('opens just below the node, centred, when there is room (TB)', () => {
    const box = { x: 100, y: 100, w: 160, h: 72 }
    const pos = placePicker({ box, menu, bounds: roomy, direction: 'TB', gap: 8 })
    expect(pos.y).toBe(180) // node bottom (172) + gap (8)
    expect(pos.x).toBe(52) // centred: 100 + 80 - 128
  })

  it('flips ABOVE the node when below would spill past the bounds (TB)', () => {
    const box = { x: 100, y: 400, w: 160, h: 72 }
    const bounds = { x: 0, y: 0, w: 1000, h: 500 } // 480+232 spills past 500
    const pos = placePicker({ box, menu, bounds, direction: 'TB', gap: 8 })
    expect(pos.y).toBe(160) // node top (400) - gap (8) - menu height (232)
  })

  it('clamps within the bounds when it fits neither below nor above (TB)', () => {
    const box = { x: 100, y: 20, w: 160, h: 72 }
    const bounds = { x: 0, y: 0, w: 1000, h: 300 }
    const pos = placePicker({ box, menu, bounds, direction: 'TB', gap: 8 })
    expect(pos.y).toBe(68) // clamped to bounds.h - menu.h = 300 - 232
  })

  it('clamps horizontally so a right-edge node keeps the menu on screen', () => {
    const box = { x: 900, y: 100, w: 160, h: 72 }
    const pos = placePicker({ box, menu, bounds: roomy, direction: 'TB', gap: 8 })
    expect(pos.x).toBe(744) // bounds.w - menu.w = 1000 - 256
  })

  it('opens to the right in LR, flipping left when there is no room', () => {
    const right = placePicker({ box: { x: 100, y: 100, w: 160, h: 72 }, menu, bounds: roomy, direction: 'LR', gap: 8 })
    expect(right.x).toBe(268) // node right (260) + gap (8)
    const flipped = placePicker({ box: { x: 700, y: 100, w: 160, h: 72 }, menu, bounds: roomy, direction: 'LR', gap: 8 })
    expect(flipped.x).toBe(436) // node left (700) - gap (8) - menu width (256)
  })

  it('falls back to the drop point (clamped) when there is no source box', () => {
    const pos = placePicker({ box: null, point: { x: 990, y: 990 }, menu, bounds: roomy })
    expect(pos).toEqual({ x: 744, y: 768 }) // clamped into 1000 - menu
  })
})

describe('flowchart content bounds', () => {
  it('frames all nodes with padding', () => {
    const { model } = sampleChart()
    tidyLayout(model)
    const bounds = flowchartContentBounds(model)
    expect(bounds.w).toBeGreaterThan(0)
    expect(bounds.h).toBeGreaterThan(0)
  })
})
