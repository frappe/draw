import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createDiagramStore } from './useDiagramStore.js'
import { parseDiagramDocument } from '@/diagram/schema.js'
import { arrowProportions, DEFAULT_ARROW_SHAFT, DEFAULT_ARROW_HEAD } from '@/diagram/blockArrow.js'

// Same stub as the cornerRadius test: frappe-ui's source only resolves through its
// vite plugin, and useThumbnail imports createResource.
vi.mock('frappe-ui', () => ({ createResource: () => ({ submit: () => {} }) }))
const { documentToSvg } = await import('@/composables/useThumbnail.js')

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')

function reopen(store) {
  const reopened = createDiagramStore()
  reopened.loadDocument(parseDiagramDocument(JSON.stringify(store.getDocument())))
  return reopened
}

// #469 follows cornerRadius: the handle writes a property no shape carried before,
// and a proportion the canvas honours but a reload drops is worse than no handle.
describe('an adjusted block arrow survives a save and reload', () => {
  it('round-trips both proportions through the document', () => {
    const store = createDiagramStore()
    const id = store.addShape({ type: 'arrow', x: 0, y: 0, w: 200, h: 100 })
    store.updateShapes([id], { arrowShaft: 0.12, arrowHead: 0.4 })

    const shape = reopen(store).shapeById(id)
    expect(shape.arrowShaft).toBe(0.12)
    expect(shape.arrowHead).toBe(0.4)
  })

  it('leaves an untouched arrow without the properties, on the type defaults', () => {
    const store = createDiagramStore()
    const id = store.addShape({ type: 'arrow', x: 0, y: 0, w: 200, h: 100 })

    const shape = reopen(store).shapeById(id)
    expect(shape.arrowShaft).toBeUndefined()
    expect(arrowProportions(shape)).toEqual({ shaft: DEFAULT_ARROW_SHAFT, head: DEFAULT_ARROW_HEAD })
  })

  // The export reads the same serialised document as the reload. This is the pair
  // that went wrong for cornerRadius — honoured on the canvas, ignored on the way
  // out — and an adjustable shape has the same failure available to it.
  it('exports the arrow it was adjusted to, not the stock one', () => {
    const store = createDiagramStore()
    const id = store.addShape({ type: 'arrow', x: 0, y: 0, w: 200, h: 100 })
    store.updateShapes([id], { arrowShaft: 0.1, arrowHead: 0.5 })

    const svg = documentToSvg(parseDiagramDocument(JSON.stringify(store.getDocument())))
    expect(svg).toContain('<polygon points="0,10 100,10 100,0 200,50 100,100 100,90 0,90"')
  })
})

// Browser-free node env, so the handles are pinned by source inspection.
describe('the block arrow adjustment handles (#469)', () => {
  const layer = read('../components/canvas/SelectionLayer.vue')

  it('offers one handle per proportion, only on an arrow', () => {
    expect(layer).toContain('data-testid="arrow-shaft-handle"')
    expect(layer).toContain('data-testid="arrow-head-handle"')
    expect(layer).toContain("shape?.type !== 'arrow'")
  })

  // Squares on the box are resize handles; these set a proportion and leave the box
  // alone, so they are diamonds inside it — the distinction Google Slides draws.
  it('draws them as diamonds, not as more resize squares', () => {
    expect(layer).toContain('diamond(arrowHandles.shaft')
    expect(layer).toContain('diamond(arrowHandles.head')
  })

  // The shaft handle would share the left edge with the mid-left resize handle and
  // the head handle the top edge with the mid-top one, so both are inset inside the
  // shape by the same amount the corner-rounding dot uses.
  it('insets them so neither lands under a resize handle', () => {
    expect(layer).toContain('shape.x + MIN_ROUNDING_INSET')
    expect(layer).toContain('shape.y + MIN_ROUNDING_INSET')
  })

  it('hides them on a shape too small to separate them', () => {
    expect(layer).toContain('MIN_ROUNDING_INSET * 3')
  })

  // The issue asked for this to reuse the corner rounder's mechanism rather than a
  // second gesture implementation.
  it('drives them through the shared drag gesture', () => {
    const transform = read('../composables/useShapeTransform.js')
    expect(transform).toContain('startArrowShaft')
    expect(transform).toContain('startArrowHead')
    expect(transform).toContain('function createArrowAdjuster')
  })
})
