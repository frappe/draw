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

  it('exposes the monochrome node default and neutral endpoints', () => {
    expect(NODE_GRAY).toEqual({ fill: '#F3F3F3', border: '#C7C7C7', ink: '#171717' })
    expect(NEUTRALS).toEqual({ white: '#FFFFFF', black: '#000000' })
  })

  it('picks dark ink on a light fill and white ink on a dark fill', () => {
    expect(inkFor('#F3F3F3')).toBe('#1F2933')
    expect(inkFor('#171717')).toBe('#FFFFFF')
  })
})
