import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { canvasTextShape, fitsWidthToText, LINE_HEIGHT } from './useTextEditing.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')

// #418: double-clicking empty canvas did nothing on a block or unified document,
// and dropped a fixed 180×44 box on a whiteboard. Both place the same element now,
// sized to its content.
describe('the text element a canvas click places', () => {
  it('starts at one line, not a fixed box', () => {
    const shape = canvasTextShape({ x: 100, y: 100 }, { size: 16 })
    expect(shape.type).toBe('text')
    expect(shape.h).toBe(Math.ceil(16 * LINE_HEIGHT) + 8)
    expect(shape.w, 'a 180-wide box is the thing being replaced').toBeLessThan(60)
  })

  it('grows with the font it is given', () => {
    const small = canvasTextShape({ x: 0, y: 0 }, { size: 12 })
    const large = canvasTextShape({ x: 0, y: 0 }, { size: 32 })
    expect(large.h).toBeGreaterThan(small.h)
  })

  // Excalidraw puts the caret where you clicked. Centring the BOX on the click
  // would put the caret half a box to the right of it.
  it('lands the caret near the click rather than centring the box on it', () => {
    const shape = canvasTextShape({ x: 300, y: 200 }, { size: 16 })
    expect(Math.abs(shape.x - 300), 'the box is offset by more than its padding').toBeLessThanOrEqual(12)
    expect(shape.y).toBeLessThan(200)
    expect(shape.y + shape.h).toBeGreaterThan(200)
  })

  it('is marked as hugging its text, and starts empty and left-aligned', () => {
    const shape = canvasTextShape({ x: 0, y: 0 })
    expect(fitsWidthToText(shape)).toBe(true)
    expect(shape.text.content).toBe('')
    expect(shape.text.align).toBe('left')
  })

  it('leaves every other shape wrapping as before', () => {
    expect(fitsWidthToText({ type: 'rectangle', text: { content: 'hi' } })).toBe(false)
    expect(fitsWidthToText({ type: 'text', text: {} })).toBe(false)
    expect(fitsWidthToText(undefined)).toBe(false)
  })
})

// The width only tracks the text because the field does not wrap — with wrapping,
// scrollWidth can never exceed the box and the measurement reads back nothing.
// These two have to stay together, so they are pinned together.
describe('measuring the width of an unwrapped element', () => {
  it('measures the string against the font, not the constrained field', () => {
    const editor = read('../components/canvas/TextEditor.vue')
    expect(editor).toContain("whiteSpace: 'pre'")
    expect(editor).toContain('textWidth(text, style)')
    expect(editor).toContain('fitsWidthToText(shape.value)')
  })

  it('renders the committed label unwrapped too, so it matches what was typed', () => {
    const view = read('../components/canvas/ShapeView.vue')
    expect(view).toContain('fitsWidthToText(props.shape)')
    expect(view).toContain("{ whiteSpace: 'pre' }")
  })

  it('double-clicking empty canvas places one', () => {
    const canvas = read('../components/canvas/DiagramCanvas.vue')
    expect(canvas).toContain('placeCanvasText(point)')
    expect(canvas).toContain('canvasTextShape(point')
  })
})
