import { describe, it, expect } from 'vitest'
import { PEN_WIDTHS, HIGHLIGHTER_WIDTHS } from '@/diagram/whiteboardColors.js'

// #498: the middle and right highlighter options drew the SAME dot — not a
// perception problem, the same number of pixels. `Math.min(size, 18)` capped the
// top of the range instead of mapping it, so 18 and 26 both came out 18.
//
// dotStyle lives in a .vue file this browser-free env cannot import, so the rule is
// restated here and the component is checked to be using it. The rule is what the
// test is for: any two sizes in a row must draw two different dots.
const DOT_MIN = 4
const DOT_MAX = 18
function dotSize(size, sizes) {
  const smallest = Math.min(...sizes)
  const largest = Math.max(...sizes)
  const position = largest === smallest ? 1 : (size - smallest) / (largest - smallest)
  return Math.round(DOT_MIN + position * (DOT_MAX - DOT_MIN))
}

describe('the size preview dots (#498)', () => {
  it.each([
    ['highlighter', HIGHLIGHTER_WIDTHS],
    ['pen', PEN_WIDTHS],
  ])('draws a distinct dot for every %s size', (_name, sizes) => {
    const dots = sizes.map((size) => dotSize(size, sizes))
    expect(new Set(dots).size, `${dots.join(', ')} — two options drawn alike`).toBe(sizes.length)
  })

  it('is the highlighter that was broken: 18 and 26 both capped to 18', () => {
    const clamped = HIGHLIGHTER_WIDTHS.map((size) => Math.min(size, 18))
    expect(new Set(clamped).size).toBeLessThan(HIGHLIGHTER_WIDTHS.length)
  })

  it('never draws a dot too small to see, nor one too big for the cell', () => {
    for (const sizes of [PEN_WIDTHS, HIGHLIGHTER_WIDTHS]) {
      for (const size of sizes) {
        expect(dotSize(size, sizes)).toBeGreaterThanOrEqual(DOT_MIN)
        // The cell is h-7 — 28px — so the dot has to stay inside it.
        expect(dotSize(size, sizes)).toBeLessThanOrEqual(DOT_MAX)
      }
    }
  })

  it('grows with the size it stands for', () => {
    const dots = HIGHLIGHTER_WIDTHS.map((size) => dotSize(size, HIGHLIGHTER_WIDTHS))
    expect(dots).toEqual([...dots].sort((a, b) => a - b))
  })
})

// The component has to be reading the row's range, not just one number: a pure
// function of a single size cannot tell 18 from 26 in the first place.
describe('the Draw popover uses the scaled dot', () => {
  it('passes the row’s own sizes alongside the value', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const path = await import('node:path')
    const here = path.dirname(fileURLToPath(import.meta.url))
    // Comments stripped: the comment recording this change QUOTES the old clamp,
    // which is what a comment about a removal is for.
    const source = readFileSync(path.join(here, 'WhiteboardTools.vue'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(source).toContain('dotStyle(w, activeDrawWidths)')
    expect(source).not.toContain('Math.min(size, 18)')
  })
})
