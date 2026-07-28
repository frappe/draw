import { describe, it, expect } from 'vitest'
import { startPaletteDrag, isConnectorType, DATA_TRANSFER_KEY } from './useShapeCreation.js'

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

describe('isConnectorType', () => {
  it('separates connectors from shapes, which the drop path branches on', () => {
    expect(isConnectorType('rect')).toBe(false)
    // A connector drops as a two-endpoint line, not a boxed shape.
    expect(isConnectorType('line')).toBe(true)
  })
})
