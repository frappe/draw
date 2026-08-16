import { describe, it, expect } from 'vitest'
import { ESPRESSO_FAMILIES, SHADE_LEVELS, NODE_GRAY, NEUTRALS, allSwatches, inkFor } from './espressoPalette.js'

describe('espressoPalette', () => {
  it('is a curated 9 x 6 grid (families x shades)', () => {
    expect(ESPRESSO_FAMILIES).toHaveLength(9)
    expect(SHADE_LEVELS).toHaveLength(6)
    for (const family of ESPRESSO_FAMILIES) expect(family.shades).toHaveLength(6)
    expect(allSwatches()).toHaveLength(54)
  })

  it('holds valid uppercase hex values only', () => {
    for (const hex of allSwatches()) expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('exposes the monochrome node default', () => {
    expect(NODE_GRAY).toEqual({ fill: '#F3F3F3', border: '#C7C7C7', ink: '#171717' })
  })

  // #474: the top row held None, White and Black, but the white swatch was a white
  // square on a white panel behind a hairline — invisible, so the row read as two
  // items with a gap. White is what the row is for; black moved into the greys.
  describe('the top row and the grey family (#474)', () => {
    const greys = ESPRESSO_FAMILIES[0]

    it('keeps white alone beside "No fill"', () => {
      expect(NEUTRALS).toEqual({ white: '#FFFFFF' })
    })

    it('ends the grey family at true black', () => {
      expect(greys.name).toBe('gray')
      expect(greys.shades.at(-1)).toBe('#000000')
      // gray-900 was the darkest shade, so the grid offered no true black at all
      // once black left the neutrals row.
      expect(greys.shades).not.toContain('#171717')
    })

    // The grid is fill/border only, and ink is derived by inkFor rather than picked,
    // so taking gray-900 out of the grid does not take it out of the app.
    it('leaves the standard ink alone', () => {
      expect(NODE_GRAY.ink).toBe('#171717')
    })

    // Black must appear exactly once, or the grid offers the same colour twice —
    // which is the defect that started this, in the other direction.
    it('offers black in one place only', () => {
      const blacks = [...allSwatches(), ...Object.values(NEUTRALS)].filter((hex) => hex === '#000000')
      expect(blacks).toHaveLength(1)
    })
  })

  it('picks dark ink on a light fill and white ink on a dark fill', () => {
    expect(inkFor('#F3F3F3')).toBe('#1F2933')
    expect(inkFor('#171717')).toBe('#FFFFFF')
  })
})
