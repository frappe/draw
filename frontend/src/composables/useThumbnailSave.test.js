import { describe, it, expect, vi, beforeEach } from 'vitest'

// What useThumbnail SENDS, as opposed to what documentToSvg renders (covered in
// useThumbnail.test.js). Records every save_thumbnail submission through the
// frappe-ui module boundary, which only resolves through its vite plugin.
const submissions = vi.hoisted(() => [])
vi.mock('frappe-ui', () => ({
  createResource: () => ({ submit: (payload) => submissions.push(payload) }),
}))

const { useThumbnail } = await import('./useThumbnail.js')

const EMPTY = { schemaVersion: 1, diagramType: 'block', shapes: [], connectors: [], sections: [] }

function harness(document) {
  return useThumbnail({ getDocument: () => document }, { doc: { name: 'diagram-1' } })
}

beforeEach(() => {
  submissions.length = 0
})

describe('saving the thumbnail of an emptied diagram (#93, #223)', () => {
  it('clears the stored thumbnail instead of storing a blank raster', async () => {
    // A blank white PNG is indistinguishable from a real preview without reading
    // the document, which is exactly what Home stopped downloading.
    const result = await harness(EMPTY).generate()

    expect(result).toBeNull()
    expect(submissions).toEqual([{ name: 'diagram-1', thumbnail: '' }])
  })

  it('does not try to rasterize an empty document', async () => {
    // rasterize() needs a browser Image; reaching it in this environment throws.
    await expect(harness(EMPTY).generate()).resolves.toBeNull()
  })

  it('still throttles, so an idle editor does not clear on a loop', async () => {
    const thumbnail = harness(EMPTY)
    await thumbnail.generate()
    await thumbnail.generate()

    expect(submissions).toHaveLength(1)
  })

  it('does nothing at all before the diagram has a name', async () => {
    const thumbnail = useThumbnail({ getDocument: () => EMPTY }, { doc: null })

    await expect(thumbnail.generate()).resolves.toBeNull()
    expect(submissions).toEqual([])
  })
})
