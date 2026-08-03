import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useViewport } from './useViewport.js'

// Capture the options passed to FileUploadHandler.upload so we can assert the
// diagram-attach params that fix #74. The mock resolves a file_url like a real
// upload so insert() runs to completion.
const captured = { options: null }
vi.mock('frappe-ui', () => ({
  FileUploadHandler: class {
    upload(file, options) {
      captured.options = options
      return Promise.resolve({ file_url: '/files/inserted.png' })
    }
  },
}))

// naturalSize() builds `new Image()` and waits for onload; stub it so the promise
// resolves without a real image decode (naturalWidth stays undefined → fallback).
class FakeImage {
  set src(_value) {
    queueMicrotask(() => this.onload && this.onload())
  }
}

const { useImageInsert } = await import('./useImageInsert.js')

function fakeStore(name) {
  return {
    state: { name, canvas: { width: 1280, height: 720 } },
    addShape: vi.fn(() => 'shape-1'),
    select: vi.fn(),
  }
}
const pngFile = { type: 'image/png', name: 'photo.png' }

describe('useImageInsert', () => {
  beforeEach(() => {
    captured.options = null
    vi.stubGlobal('Image', FakeImage)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('attaches the upload to the diagram and routes it through Draw’s endpoint (#74)', async () => {
    const store = fakeStore('my-diagram')
    const id = await useImageInsert(store).insert(pngFile)

    // Attached to the diagram + routed to the server endpoint, so Suite's Drive
    // never adopts it as a stray Home file.
    expect(captured.options).toEqual({
      private: false,
      doctype: 'Draw Diagram',
      docname: 'my-diagram',
      method: 'draw.api.diagram.upload_diagram_image',
    })
    expect(store.addShape).toHaveBeenCalledOnce()
    expect(store.addShape.mock.calls[0][0]).toMatchObject({ type: 'image', src: '/files/inserted.png' })
    expect(id).toBe('shape-1')
  })

  it('falls back to a plain upload when the diagram name is not known yet', async () => {
    const store = fakeStore(undefined)
    await useImageInsert(store).insert(pngFile)
    expect(captured.options).toEqual({ private: false })
  })

  it('ignores a non-image file without uploading', async () => {
    const store = fakeStore('my-diagram')
    const result = await useImageInsert(store).insert({ type: 'application/pdf', name: 'x.pdf' })
    expect(result).toBeNull()
    expect(captured.options).toBeNull()
  })

  // #119 / in-view part of #75: a picked image is centred on the point the palette
  // passes (the viewport centre) so it lands where the user is looking — NOT at the
  // fixed canvas centre, which sits off-screen once the canvas is panned — and the
  // insert never moves the camera to reveal it.
  it('centres a picked image on the given in-view point, camera untouched', async () => {
    const viewport = useViewport()
    viewport.setMeasure({ containerW: 1200, containerH: 800 })
    viewport.setZoom(0.75)
    viewport.setPan(-1500, -900)
    const view = viewport.visibleRect()
    const at = viewport.centerPoint() // what BottomPalette/WhiteboardTools pass to pick()
    const before = { panX: viewport.state.panX, panY: viewport.state.panY, zoom: viewport.state.zoom }

    const store = fakeStore('my-diagram')
    await useImageInsert(store).insert(pngFile, at)

    const placed = store.addShape.mock.calls[0][0]
    const rect = { x: placed.x, y: placed.y, w: placed.w, h: placed.h }
    // Lands inside the visible rect.
    expect(rect.x).toBeGreaterThanOrEqual(view.x - 1e-6)
    expect(rect.y).toBeGreaterThanOrEqual(view.y - 1e-6)
    expect(rect.x + rect.w).toBeLessThanOrEqual(view.x + view.w + 1e-6)
    expect(rect.y + rect.h).toBeLessThanOrEqual(view.y + view.h + 1e-6)
    // Centred on the point (within rounding), well away from the canvas centre (640,360).
    expect(Math.abs(rect.x + rect.w / 2 - at.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(rect.y + rect.h / 2 - at.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(at.x - 640)).toBeGreaterThan(100)
    // Camera never moved.
    expect(viewport.state.panX).toBe(before.panX)
    expect(viewport.state.panY).toBe(before.panY)
    expect(viewport.state.zoom).toBe(before.zoom)
  })
})
