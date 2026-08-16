import { describe, it, expect } from 'vitest'
import { ESPRESSO_FAMILIES, SHADE_LEVELS, NODE_GRAY, NEUTRALS, allSwatches, inkFor, nearestSwatch } from './espressoPalette.js'

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

// #495: one palette across the app means diagrams made against the OLD one hold
// colours that are not in the grid — SWATCH_PALETTE's red is #E24C4C against
// Espresso's #E03636. Matched by string those shapes ring nothing, so the picker
// opens looking unset on a shape that plainly has a colour.
//
// Vibhav's call (16 Aug 2026): ring the nearest swatch, never rewrite what is
// stored. Nothing on anyone's canvas changes colour.
describe('nearestSwatch (#495)', () => {
  it('returns a colour already in the grid unchanged', () => {
    for (const hex of allSwatches()) {
      expect(nearestSwatch(hex)).toBe(hex)
    }
  })

  it('matches regardless of case, since stored values are not normalised', () => {
    expect(nearestSwatch('#e03636')).toBe('#E03636')
  })

  it.each([
    ['the old red', '#E24C4C', 'red'],
    ['the old green', '#1F9D57', 'green'],
    ['the old light green', '#88D5A5', 'green'],
    ['the old light red', '#F08A8A', 'red'],
  ])('puts %s in the right family', (_name, stored, family) => {
    const match = nearestSwatch(stored)
    const shades = ESPRESSO_FAMILIES.find((entry) => entry.name === family).shades
    expect(shades, `${stored} matched ${match}, which is not a ${family}`).toContain(match)
  })

  it('finds white, which lives outside the family grid', () => {
    expect(nearestSwatch('#FEFEFE')).toBe('#FFFFFF')
  })

  it('is null for anything that is not a colour', () => {
    // 'none' and 'transparent' are sentinels the pickers use for "no fill".
    for (const value of ['none', 'transparent', '', null, undefined, 'rgb(1,2,3)', '#12345']) {
      expect(nearestSwatch(value)).toBeNull()
    }
  })

  it('reads three-digit hex, which a hand-edited document can carry', () => {
    expect(nearestSwatch('#fff')).toBe('#FFFFFF')
    expect(nearestSwatch('#000')).toBe('#000000')
  })

  it('never returns null for a real colour — the picker must ring something', () => {
    for (const hex of ['#123456', '#ABCDEF', '#010101', '#FEDCBA']) {
      expect(nearestSwatch(hex)).not.toBeNull()
    }
  })
})
