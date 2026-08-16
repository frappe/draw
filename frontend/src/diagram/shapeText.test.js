import { describe, it, expect } from 'vitest'
import { canHoldText } from './shapeText.js'
import { createShape } from './factories.js'

// The insertable catalogue, listed here rather than imported: useInsertCatalog
// pulls frappe-ui into the module graph, which this node-environment file cannot
// resolve. Keep in step with SHAPES there.
const INSERTABLE = [
  'rectangle', 'rounded', 'ellipse', 'triangle', 'hexagon',
  'polygon', 'arrow', 'trapezoid', 'parallelogram',
]

// #519: selecting an image showed the whole text toolbar — font, size, the four
// marks, alignment and text colour — reading "Inter" and 16 for a shape that has
// neither. The trap is that the question cannot be answered by looking for a
// `text` block, because createShape gives one to everything.
describe('canHoldText', () => {
  it('is not answerable from the shape data — every shape carries a text block', () => {
    // The reason this predicate exists rather than a `shape.text` check.
    expect(createShape({ type: 'image' }).text).toBeTruthy()
    expect(createShape({ type: 'rectangle' }).text).toBeTruthy()
  })

  it('refuses an image', () => {
    expect(canHoldText(createShape({ type: 'image' }))).toBe(false)
  })

  it('accepts every shape the Shapes menu can insert', () => {
    for (const type of INSERTABLE) {
      expect(canHoldText(createShape({ type })), `${type} should take a label`).toBe(true)
    }
  })

  it('accepts a text element and the node roles', () => {
    expect(canHoldText(createShape({ type: 'text' }))).toBe(true)
    expect(canHoldText(createShape({ type: 'rounded', role: 'mindmap-node' }))).toBe(true)
    expect(canHoldText(createShape({ type: 'diamond', role: 'flowchart-node' }))).toBe(true)
  })

  it('is false for nothing at all', () => {
    expect(canHoldText(null)).toBe(false)
    expect(canHoldText(undefined)).toBe(false)
  })
})
