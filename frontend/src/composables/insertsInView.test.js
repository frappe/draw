import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { useViewport } from './useViewport.js'
import { tableInsertOrigin } from '@/components/floating/tableSizePicker.js'
import { TABLE_CELL_W, TABLE_CELL_H } from '@/diagram/whiteboardModel.js'
import { nodeSize } from '@/diagram/flowchartModel.js'

// #119 / in-view part of #75: adding a shape / node / map / chart / table must NEVER
// pan or scroll the canvas — the new content lands inside the currently visible rect
// and the camera (panX / panY / zoom) stays exactly where the user left it. These
// tests drive the real insert paths against a real viewport that has been PANNED and
// ZOOMED away from the origin, and assert both invariants after every insert.

const unified = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

// A viewport parked well away from the origin and off 100% zoom, so a placement that
// still used a fixed / canvas-centre origin (the old bug) would land outside the view.
function pannedViewport() {
  const viewport = useViewport()
  viewport.setMeasure({ containerW: 1200, containerH: 800 })
  viewport.setZoom(0.75) // re-centres pan on the container…
  viewport.setPan(-1500, -900) // …then park it at a known translation
  return viewport
}

const camera = (viewport) => ({
  panX: viewport.state.panX,
  panY: viewport.state.panY,
  zoom: viewport.state.zoom,
})

function expectCameraUnchanged(viewport, before) {
  expect(camera(viewport)).toEqual(before)
}

// The whole point (#75): the user can see what they just inserted.
function expectInsideView(rect, view) {
  expect(rect.x).toBeGreaterThanOrEqual(view.x - 1e-6)
  expect(rect.y).toBeGreaterThanOrEqual(view.y - 1e-6)
  expect(rect.x + rect.w).toBeLessThanOrEqual(view.x + view.w + 1e-6)
  expect(rect.y + rect.h).toBeLessThanOrEqual(view.y + view.h + 1e-6)
}

const rectOf = (s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })

describe('inserting a mind map lands it in view and never pans (#119/#75)', () => {
  it('centres the mind-map node in the visible rect with the camera untouched', () => {
    const store = unified()
    const viewport = pannedViewport()
    const before = camera(viewport)

    store.insertMindmapStarter(viewport.visibleRect())

    const node = store.state.shapes.find((s) => s.role === 'mindmap-node')
    expect(node).toBeTruthy()
    expectInsideView(rectOf(node), viewport.visibleRect())
    expectCameraUnchanged(viewport, before)
  })
})

describe('inserting a flowchart lands it in view and never pans (#119/#75)', () => {
  it('centres the flowchart node in the visible rect with the camera untouched', () => {
    const store = unified()
    const viewport = pannedViewport()
    const before = camera(viewport)

    store.insertFlowchartStarter(viewport.visibleRect(), 'process')

    const node = store.state.shapes.find((s) => s.role === 'flowchart-node')
    expect(node).toBeTruthy()
    expectInsideView(rectOf(node), viewport.visibleRect())
    expectCameraUnchanged(viewport, before)
  })
})

describe('inserting a table lands it in view and never pans (#119/#75)', () => {
  it('centres the table in the visible rect with the camera untouched', () => {
    const store = unified()
    const viewport = pannedViewport()
    const before = camera(viewport)

    const rows = 3
    const cols = 4
    const origin = tableInsertOrigin(viewport.visibleRect(), rows, cols)
    store.addTable(origin.x, origin.y, { rows, cols })

    const table = store.state.whiteboard.tables[0]
    const rect = { x: table.x, y: table.y, w: cols * TABLE_CELL_W, h: rows * TABLE_CELL_H }
    expectInsideView(rect, viewport.visibleRect())
    expectCameraUnchanged(viewport, before)
  })
})

describe('inserting a shape at a drop/click point never pans (#119)', () => {
  // Shapes are placed at the pointer, so they are inherently in view; the invariant
  // that matters is that committing one leaves the camera exactly where it was.
  it('adds a shape without touching the viewport', () => {
    const store = unified()
    const viewport = pannedViewport()
    const before = camera(viewport)
    const view = viewport.visibleRect()

    // A point the user could have clicked, inside the current view.
    const at = { x: view.x + view.w / 2, y: view.y + view.h / 2 }
    store.addShape({ type: 'rectangle', x: at.x - 90, y: at.y - 48, w: 180, h: 96 })

    const shape = store.state.shapes[0]
    expectInsideView(rectOf(shape), view)
    expectCameraUnchanged(viewport, before)
  })
})

describe('flowchart blank-state "Add first step" places in view without panning (#119)', () => {
  // Mirrors FlowchartOverlay.addFirstStep exactly (legacy single-type flowchart): the
  // first node is centred in the visible rect and the camera is NOT re-framed. Before
  // the fix it was dropped at (0,0) and the viewport was panned to reveal it.
  it('centres the first node in view and leaves the camera put', () => {
    const store = createDiagramStore(createDiagramDocument(undefined, 'flowchart'))
    const viewport = pannedViewport()
    const before = camera(viewport)

    const size = nodeSize({ nodeType: 'process' })
    const view = viewport.visibleRect()
    const x = Math.round(view.x + (view.w - size.w) / 2)
    const y = Math.round(view.y + (view.h - size.h) / 2)
    store.addFlowchartNode('process', '', x, y)

    const node = store.state.flowchart.nodes[0]
    expectInsideView(rectOf(node), view)
    expectCameraUnchanged(viewport, before)
  })
})

// Source-inspection guards (house pattern, cf. ShareMenu.test.js): the browser-free
// node env can't mount the overlays, so pin the wiring that keeps the camera still.
const readSrc = (rel) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), rel), 'utf8')

describe('no insert path re-frames the camera (wiring guards)', () => {
  it('useViewport no longer exposes the placeTopCenter pan-on-insert helper', () => {
    const src = readSrc('./useViewport.js')
    expect(src).not.toContain('placeTopCenter')
  })

  it('FlowchartOverlay places the first node via visibleRect, not a viewport pan', () => {
    const src = readSrc('../components/canvas/FlowchartOverlay.vue')
    expect(src).toContain('visibleRect()')
    expect(src).not.toContain('placeTopCenter')
  })

  it('MindMapOverlay does not fit/pan the camera when adding the first idea', () => {
    const src = readSrc('../components/canvas/MindMapOverlay.vue')
    // addFirstIdea must not call editorUi.fit (the old camera move).
    const addFirstIdea = src.slice(src.indexOf('function addFirstIdea'))
    expect(addFirstIdea.slice(0, addFirstIdea.indexOf('}'))).not.toContain('fit')
  })

  it('the image tools pick into the viewport centre so a picked image lands in view', () => {
    expect(readSrc('./useInsertCatalog.js')).toContain(
      'imageInsert.pick(() => viewport.centerPoint())',
    )
    expect(readSrc('../components/floating/WhiteboardTools.vue')).toContain(
      'imageInsert.pick(() => editorUi.viewport.centerPoint())',
    )
  })
})
