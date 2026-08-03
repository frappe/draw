import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
})
