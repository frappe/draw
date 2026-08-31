import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useViewport } from './useViewport.js'

// Capture the options passed to FileUploadHandler.upload so we can assert the
// diagram-attach params that fix #74. The mock resolves a file_url like a real
// upload so insert() runs to completion.
const captured = { options: null, result: null, error: null }
const toast = { error: vi.fn(), success: vi.fn() }
vi.mock('frappe-ui', () => ({
  FileUploadHandler: class {
    upload(file, options) {
      captured.options = options
      if (captured.error) return Promise.reject(captured.error)
      return Promise.resolve(captured.result ?? { file_url: '/files/inserted.png' })
    }
  },
  toast,
}))

// naturalSize() builds `new Image()` and waits for onload; stub it so the promise
// resolves without a real image decode (naturalWidth stays undefined → fallback).
class FakeImage {
  set src(_value) {
    queueMicrotask(() => this.onload && this.onload())
  }
}

const { useImageInsert } = await import('./useImageInsert.js')

// insertImage is the store op the real store carries; it is what places the box, so
// the fake reproduces its centring to keep the placement assertions honest.
function fakeStore(name) {
  const store = {
    state: { name, canvas: { width: 1280, height: 720 } },
    addShape: vi.fn(() => 'shape-1'),
    select: vi.fn(),
  }
  store.insertImage = (image, at) => {
    const cx = at?.x ?? store.state.canvas.width / 2
    const cy = at?.y ?? store.state.canvas.height / 2
    const id = store.addShape({
      type: 'image',
      src: image.src,
      x: Math.round(cx - image.w / 2),
      y: Math.round(cy - image.h / 2),
      w: image.w,
      h: image.h,
    })
    store.select(id)
    return id
  }
  return store
}
const pngFile = { type: 'image/png', name: 'photo.png' }

describe('useImageInsert', () => {
  beforeEach(() => {
    captured.options = null
    captured.result = null
    captured.error = null
    toast.error.mockClear()
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
    expect(toast.success).toHaveBeenCalledWith('Image uploaded successfully')
  })

  it('falls back to a plain upload when the diagram name is not known yet', async () => {
    const store = fakeStore(undefined)
    await useImageInsert(store).insert(pngFile)
    expect(captured.options).toEqual({ private: false })
  })

  it('refuses a non-image file without uploading, and says so', async () => {
    const store = fakeStore('my-diagram')
    const result = await useImageInsert(store).insert({ type: 'application/pdf', name: 'x.pdf' })
    expect(result).toBeNull()
    expect(captured.options).toBeNull()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('x.pdf'))
  })

  // #502: every one of these used to be a silent `return null` or an unhandled
  // rejection. From the canvas they were indistinguishable from nothing happening.
  describe('a failed insert says why (#502)', () => {
    it('refuses a file over the 10 MB server limit before uploading it', async () => {
      const store = fakeStore('my-diagram')
      const big = { type: 'image/png', name: 'huge.png', size: 11 * 1024 * 1024 }
      expect(await useImageInsert(store).insert(big)).toBeNull()
      expect(captured.options).toBeNull() // never left the browser
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('10 MB'))
    })

    it('refuses an extension the server would reject', async () => {
      const store = fakeStore('my-diagram')
      const bmp = { type: 'image/bmp', name: 'old.bmp' }
      expect(await useImageInsert(store).insert(bmp)).toBeNull()
      expect(captured.options).toBeNull()
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('.bmp'))
    })

    it('reports the server’s own message when the upload throws', async () => {
      const store = fakeStore('my-diagram')
      captured.error = { messages: ['Image is too large'] }
      expect(await useImageInsert(store).insert(pngFile)).toBeNull()
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Image is too large'))
      expect(store.addShape).not.toHaveBeenCalled()
    })

    it('reports an upload that comes back without a file url', async () => {
      const store = fakeStore('my-diagram')
      captured.result = {}
      expect(await useImageInsert(store).insert(pngFile)).toBeNull()
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('photo.png'))
      expect(store.addShape).not.toHaveBeenCalled()
    })

    it('says nothing when the insert works', async () => {
      const store = fakeStore('my-diagram')
      await useImageInsert(store).insert(pngFile)
      expect(toast.error).not.toHaveBeenCalled()
    })
  })

  // #503: the picker hands the uploaded image to its caller to ARM, instead of
  // dropping it at the viewport centre. A rejected file arms nothing.
  describe('pick hands an uploaded image to its caller (#503)', () => {
    // vitest runs this file in the node environment, so there is no document to spy
    // on — the whole thing is stubbed, which is enough for an <input type="file">.
    function fakePicker(file) {
      const input = { type: '', accept: '', files: file ? [file] : [], click: vi.fn(), listeners: {} }
      input.addEventListener = (name, fn) => (input.listeners[name] = fn)
      vi.stubGlobal('document', { createElement: () => input })
      return input
    }

    it('passes the uploaded image, measured and capped, to onReady', async () => {
      const store = fakeStore('my-diagram')
      const input = fakePicker(pngFile)
      const onReady = vi.fn()
      useImageInsert(store).pick(onReady)
      await input.listeners.change()
      await vi.waitFor(() => expect(onReady).toHaveBeenCalled())
      expect(onReady.mock.calls[0][0]).toMatchObject({ src: '/files/inserted.png' })
      expect(toast.success).toHaveBeenCalledWith('Image uploaded successfully')
      // Armed, not placed: nothing reaches the canvas until the click.
      expect(store.addShape).not.toHaveBeenCalled()
    })

    it('arms nothing when the chosen file is refused', async () => {
      const store = fakeStore('my-diagram')
      const input = fakePicker({ type: 'application/pdf', name: 'x.pdf' })
      const onReady = vi.fn()
      useImageInsert(store).pick(onReady)
      await input.listeners.change()
      await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
      expect(onReady).not.toHaveBeenCalled()
    })
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
