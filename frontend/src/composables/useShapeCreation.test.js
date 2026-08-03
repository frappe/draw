import { describe, it, expect } from 'vitest'
import {
  startPaletteDrag,
  isConnectorType,
  DATA_TRANSFER_KEY,
  useShapeCreation,
  draftPreviewShape,
} from './useShapeCreation.js'
import { shapeCornerRadius } from '@/diagram/shapeGeometry.js'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'

// The palette-drag gesture has two halves in different files: the tile produces a
// dataTransfer payload (startPaletteDrag) and the canvas consumes it
// (onCanvasDrop -> readToolPayload). They agree only via DATA_TRANSFER_KEY, and a
// mismatch fails silently — the drag just does nothing — so pin the contract.

function fakeDragEvent() {
  const data = {}
  return {
    dataTransfer: {
      effectAllowed: null,
      setData: (key, value) => (data[key] = value),
      getData: (key) => data[key] || '',
      types: [],
    },
    _data: data,
  }
}

function fakeEditorUi() {
  const calls = []
  return { calls, setDrawShape: (type) => calls.push(type) }
}

describe('startPaletteDrag', () => {
  it('writes the tool type under the key the canvas drop handler reads', () => {
    const event = fakeDragEvent()
    startPaletteDrag(event, 'ellipse', fakeEditorUi())
    expect(event._data[DATA_TRANSFER_KEY]).toBe('ellipse')
  })

  it('arms draw mode for the dragged type, so releasing off-canvas still leaves the tool ready', () => {
    const editorUi = fakeEditorUi()
    startPaletteDrag(fakeDragEvent(), 'diamond', editorUi)
    expect(editorUi.calls).toEqual(['diamond'])
  })

  it('marks the drag as a copy so the cursor reads correctly', () => {
    const event = fakeDragEvent()
    startPaletteDrag(event, 'rect', fakeEditorUi())
    expect(event.dataTransfer.effectAllowed).toBe('copy')
  })

  it('does not throw when dataTransfer is absent (synthetic events)', () => {
    expect(() => startPaletteDrag({}, 'rect', fakeEditorUi())).not.toThrow()
  })
})

// The canvas ghosts the draft with ShapeView, which needs the armed type — without
// it every shape previewed as a rectangle (issue #31).
function fakeDrawUi(type) {
  return {
    state: { tool: 'draw', drawShapeType: type },
    viewport: { state: { panX: 0, panY: 0, zoom: 1 } },
    setTool: () => {},
  }
}

// The drag arms edge auto-pan, which schedules a frame; the node test env has no
// rAF, and the pan itself is not what these tests are about.
globalThis.requestAnimationFrame ??= () => 0

function fakePointerEvent(x, y, shiftKey = false) {
  return {
    button: 0,
    shiftKey,
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }), scrollLeft: 0, scrollTop: 0 },
  }
}

describe('draw preview', () => {
  it('carries the armed shape type through the drag', () => {
    const creation = useShapeCreation({}, fakeDrawUi('ellipse'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(110, 60))
    expect(creation.preview.value).toMatchObject({ box: true, type: 'ellipse', x: 10, y: 10, w: 100, h: 50 })
  })

  it('previews a connector as a line, with no shape type', () => {
    const creation = useShapeCreation({}, fakeDrawUi('connector-arrow'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(50, 30))
    expect(creation.preview.value).toMatchObject({ line: true, x1: 10, y1: 10, x2: 50, y2: 30 })
  })

  // The block arrow shares its label with the arrow connector; only the ids keep
  // them apart, so pin that the shape tool still draws (and commits) a shape.
  it('previews the block arrow as a shape, not a connector line', () => {
    const creation = useShapeCreation({}, fakeDrawUi('arrow'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(90, 50))
    expect(creation.preview.value).toMatchObject({ box: true, type: 'arrow', w: 80, h: 40 })
  })

  // Pressing without moving must not flash a box ghost for a connector tool.
  it('starts a connector drag as a zero-length line, never a box', () => {
    const creation = useShapeCreation({}, fakeDrawUi('elbow'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    expect(creation.preview.value).toMatchObject({ line: true, x1: 10, y1: 10, x2: 10, y2: 10 })
  })
})

// Holding Shift while drawing constrains the draft to equal sides — a rectangle
// draws a square, an ellipse a circle (issue #132). The start corner is the
// anchor and the square grows in the drag direction, so both diagonals must end
// with w === h.
function fakeStore() {
  const shapes = []
  return { shapes, addShape: (s) => shapes.push(s), select: () => {} }
}

describe('draw preview with Shift held', () => {
  it('constrains a down-right drag to a square (equal w/h) anchored at the start', () => {
    const creation = useShapeCreation({}, fakeDrawUi('rect'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(110, 60, true))
    // side = max(|100|, |50|) = 100, grown down-right from (10,10).
    expect(creation.preview.value).toMatchObject({ box: true, type: 'rect', x: 10, y: 10, w: 100, h: 100 })
  })

  it('constrains an up-left drag to a square, keeping the start corner fixed', () => {
    const creation = useShapeCreation({}, fakeDrawUi('ellipse'))
    creation.onCanvasPointerDown(fakePointerEvent(100, 100))
    creation.onCanvasPointerMove(fakePointerEvent(40, 30, true))
    // side = max(|60|, |70|) = 70, grown up-left so the far corner is (30,30).
    expect(creation.preview.value).toMatchObject({ box: true, type: 'ellipse', x: 30, y: 30, w: 70, h: 70 })
  })

  it('commits the squared box, so the created shape has equal w/h', () => {
    const store = fakeStore()
    const creation = useShapeCreation(store, fakeDrawUi('rect'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(110, 60, true))
    creation.onCanvasPointerUp(fakePointerEvent(110, 60, true))
    expect(store.shapes).toHaveLength(1)
    expect(store.shapes[0]).toMatchObject({ type: 'rect', x: 10, y: 10, w: 100, h: 100 })
  })

  // The constraint is a box rule; connectors carry no box, so a held Shift must
  // leave the line free to point anywhere (the endpoint stays the raw pointer).
  it('leaves a connector line unconstrained under Shift', () => {
    const creation = useShapeCreation({}, fakeDrawUi('connector-arrow'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 10))
    creation.onCanvasPointerMove(fakePointerEvent(90, 20, true))
    expect(creation.preview.value).toMatchObject({ line: true, x1: 10, y1: 10, x2: 90, y2: 20 })
  })
})

// The draw ghost is rendered by mapping the raw draft to a throwaway shape that
// ShapeView draws (#130). The mapping is pure, so pin that the ghost matches what
// commits: same type (so the same corners / outline), same bounds.
describe('draftPreviewShape', () => {
  it('ghosts a rectangle with the committed rectangle corner, not the rounded rect', () => {
    const ghost = draftPreviewShape({ box: true, type: 'rectangle', x: 10, y: 20, w: 100, h: 60 })
    expect(ghost.type).toBe('rectangle')
    // ShapeView keys the corner radius off the type, so a matching type is a
    // matching corner: sharp rectangle, never the rounded rectangle's radius.
    expect(shapeCornerRadius(ghost.type)).toBe(shapeCornerRadius('rectangle'))
    expect(shapeCornerRadius(ghost.type)).not.toBe(shapeCornerRadius('rounded'))
  })

  it('ghosts an ellipse as the inscribed ellipse of the drag bounds', () => {
    // Same type + same box as the committed ellipse, which ShapeView inscribes in
    // the box (rx = w/2, ry = h/2) — so the pointer sits on the bounding box, not
    // off the curve (Figma / Excalidraw behaviour).
    const ghost = draftPreviewShape({ box: true, type: 'ellipse', x: 10, y: 20, w: 100, h: 60 })
    expect(ghost).toMatchObject({ type: 'ellipse', x: 10, y: 20, w: 100, h: 60 })
  })

  it('passes the draft bounds straight through so the ghost tracks the drag', () => {
    const ghost = draftPreviewShape({ box: true, type: 'diamond', x: 5, y: 6, w: 30, h: 40 })
    expect(ghost).toMatchObject({ x: 5, y: 6, w: 30, h: 40, fill: 'none' })
  })

  it('ghosts text and image as a plain rectangle (they have no outline of their own)', () => {
    expect(draftPreviewShape({ box: true, type: 'text', x: 0, y: 0, w: 10, h: 10 }).type).toBe('rectangle')
    expect(draftPreviewShape({ box: true, type: 'image', x: 0, y: 0, w: 10, h: 10 }).type).toBe('rectangle')
  })

  it('renders no shape ghost for a connector (line) draft or before the first move', () => {
    expect(draftPreviewShape({ line: true, x1: 0, y1: 0, x2: 5, y2: 5 })).toBeNull()
    expect(draftPreviewShape(null)).toBeNull()
  })
})

// End-to-end for the geometry: drive a drag through the composable, read the live
// preview, release, and read the committed shape — the ghost the user saw must be
// the shape they get (#130).
describe('preview matches the committed shape', () => {
  it('rectangle: same type and bounds in the preview and after release', () => {
    const store = fakeStore()
    const creation = useShapeCreation(store, fakeDrawUi('rectangle'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 20))
    creation.onCanvasPointerMove(fakePointerEvent(110, 80))
    const ghost = draftPreviewShape(creation.preview.value)
    creation.onCanvasPointerUp(fakePointerEvent(110, 80))
    const committed = store.shapes[0]
    expect(ghost).toMatchObject({ type: 'rectangle', x: 10, y: 20, w: 100, h: 60 })
    expect(committed).toMatchObject({ type: 'rectangle', x: 10, y: 20, w: 100, h: 60 })
    expect(shapeCornerRadius(ghost.type)).toBe(shapeCornerRadius(committed.type))
  })

  it('ellipse: same type and bounds in the preview and after release', () => {
    const store = fakeStore()
    const creation = useShapeCreation(store, fakeDrawUi('ellipse'))
    creation.onCanvasPointerDown(fakePointerEvent(10, 20))
    creation.onCanvasPointerMove(fakePointerEvent(110, 80))
    const ghost = draftPreviewShape(creation.preview.value)
    creation.onCanvasPointerUp(fakePointerEvent(110, 80))
    const committed = store.shapes[0]
    expect(ghost).toMatchObject({ type: 'ellipse', x: 10, y: 20, w: 100, h: 60 })
    expect(committed).toMatchObject({ type: 'ellipse', x: 10, y: 20, w: 100, h: 60 })
  })
})

describe('isConnectorType', () => {
  it('separates connectors from shapes, which the drop path branches on', () => {
    expect(isConnectorType('rect')).toBe(false)
    // A connector drops as a two-endpoint line, not a boxed shape.
    expect(isConnectorType('line')).toBe(true)
  })

  // The palette lists a block-arrow SHAPE and an arrow CONNECTOR; the connector
  // is 'connector-arrow' precisely so 'arrow' stays a shape here.
  it('treats the block arrow as a shape and the arrow connector as a connector', () => {
    expect(isConnectorType('arrow')).toBe(false)
    expect(isConnectorType('connector-arrow')).toBe(true)
  })
})

// Click-to-place for a catalog-armed mind-map / flowchart starter (#75). The canvas
// routes an armed press to creation.placeArmedStarter, which drops the starter's first
// node CENTRED on the click point and disarms back to select. A real store is used so
// the placement math (the first node lands under the cursor) is asserted end to end.
function armedUi(starter, { zoom = 1, panX = 0, panY = 0 } = {}) {
  const state = { tool: 'select', pendingStarter: starter }
  return {
    state,
    viewport: { state: { panX, panY, zoom } },
    // Mirrors editorUi.setTool: arming any tool disarms the pending starter.
    setTool: (tool) => {
      state.tool = tool
      state.pendingStarter = null
    },
  }
}

const centreOf = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 })
const unifiedStore = () => createDiagramStore(createDiagramDocument(undefined, 'unified'))

describe('placeArmedStarter (click-to-place, #75)', () => {
  it('drops a mind-map root centred on the click point and disarms to select', () => {
    const store = unifiedStore()
    const editorUi = armedUi({ kind: 'mindmap' })
    const creation = useShapeCreation(store, editorUi)

    const handled = creation.placeArmedStarter(fakePointerEvent(300, 200))

    expect(handled).toBe(true)
    const node = store.state.shapes.find((s) => s.role === 'mindmap-node')
    expect(node).toBeTruthy()
    const centre = centreOf(node)
    expect(centre.x).toBeCloseTo(300, 6)
    expect(centre.y).toBeCloseTo(200, 6)
    expect(editorUi.state.tool).toBe('select')
    expect(editorUi.state.pendingStarter).toBeNull()
  })

  it('drops a flowchart node of the armed type centred on the click point', () => {
    const store = unifiedStore()
    const editorUi = armedUi({ kind: 'flowchart', nodeType: 'decision' })
    const creation = useShapeCreation(store, editorUi)

    creation.placeArmedStarter(fakePointerEvent(120, 80))

    const node = store.state.shapes.find((s) => s.role === 'flowchart-node')
    expect(node.flowchart.nodeType).toBe('decision')
    const centre = centreOf(node)
    expect(centre.x).toBeCloseTo(120, 6)
    expect(centre.y).toBeCloseTo(80, 6)
    expect(editorUi.state.pendingStarter).toBeNull()
  })

  it('honours the viewport pan/zoom when mapping the click to a canvas point', () => {
    const store = unifiedStore()
    // Parked away from the origin and off 100%, like a real panned canvas.
    const editorUi = armedUi({ kind: 'mindmap' }, { zoom: 0.5, panX: -100, panY: -40 })
    const creation = useShapeCreation(store, editorUi)

    creation.placeArmedStarter(fakePointerEvent(300, 200))

    // logical = (client - pan) / zoom → ((300 - -100)/0.5, (200 - -40)/0.5)
    const node = store.state.shapes.find((s) => s.role === 'mindmap-node')
    const centre = centreOf(node)
    expect(centre.x).toBeCloseTo(800, 6)
    expect(centre.y).toBeCloseTo(480, 6)
  })

  it('is a no-op with nothing armed, leaving the canvas empty', () => {
    const store = unifiedStore()
    const editorUi = armedUi(null)
    const creation = useShapeCreation(store, editorUi)

    expect(creation.placeArmedStarter(fakePointerEvent(10, 10))).toBe(false)
    expect(store.state.shapes).toEqual([])
  })

  it('ignores a non-primary button so a right-click never places', () => {
    const store = unifiedStore()
    const editorUi = armedUi({ kind: 'mindmap' })
    const creation = useShapeCreation(store, editorUi)

    const rightClick = { ...fakePointerEvent(10, 10), button: 2 }
    expect(creation.placeArmedStarter(rightClick)).toBe(false)
    expect(store.state.shapes).toEqual([])
    expect(editorUi.state.pendingStarter).toEqual({ kind: 'mindmap' }) // still armed
  })
})
