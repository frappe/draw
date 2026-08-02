import { describe, it, expect } from 'vitest'
import { startPaletteDrag, isConnectorType, DATA_TRANSFER_KEY, useShapeCreation } from './useShapeCreation.js'

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
