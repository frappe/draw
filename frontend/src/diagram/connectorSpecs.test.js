import { describe, it, expect } from 'vitest'
import { CONNECTOR_SPECS, CONNECTOR_TYPES, FALLBACK_CONNECTOR } from './connectorSpecs.js'

// #499: the menu offered four tools named along neither axis. `elbow` and `curved`
// silently meant elbowed ARROW and curved ARROW, and the plain-line variants of
// those two did not exist at all — so "a line and an arrow for each shape" was two
// new tools and four renames.
//
// What a DOCUMENT stores is the geometry plus the arrowheads; these keys are tool
// ids that live only in editorUi. That is why the rename needs no migration, and
// this file is where that claim is checked.
const GEOMETRIES = ['straight', 'elbow', 'curved']

describe('CONNECTOR_SPECS', () => {
  it('offers exactly one tool per geometry per ending', () => {
    expect(CONNECTOR_TYPES).toHaveLength(6)
    for (const geometry of GEOMETRIES) {
      expect(CONNECTOR_SPECS[`line-${geometry}`], `no plain ${geometry}`).toBeTruthy()
      expect(CONNECTOR_SPECS[`arrow-${geometry}`], `no ${geometry} arrow`).toBeTruthy()
    }
  })

  it('gives a line no arrowheads and an arrow exactly one, at the end', () => {
    for (const geometry of GEOMETRIES) {
      expect(CONNECTOR_SPECS[`line-${geometry}`].arrowheads).toEqual({ start: 'none', end: 'none' })
      expect(CONNECTOR_SPECS[`arrow-${geometry}`].arrowheads).toEqual({ start: 'none', end: 'arrow' })
    }
  })

  it('pairs each line with an arrow of the SAME stored geometry', () => {
    // The pairing is the whole point of the matrix: one column, one shape.
    for (const geometry of GEOMETRIES) {
      expect(CONNECTOR_SPECS[`line-${geometry}`].type).toBe(geometry)
      expect(CONNECTOR_SPECS[`arrow-${geometry}`].type).toBe(geometry)
    }
  })

  it('stores only geometries a document already knew, so nothing needs migrating', () => {
    // The two NEW tools are new combinations, not new stored values: an elbow with
    // no heads is an `elbow` that a document could always have held.
    for (const spec of Object.values(CONNECTOR_SPECS)) {
      expect(GEOMETRIES).toContain(spec.type)
    }
  })

  it('hands out arrowheads no caller can mutate into another tool', () => {
    // Both creation paths spread these onto a new connector; a shared object would
    // let one edited connector rewrite the tool for every later one.
    CONNECTOR_SPECS['arrow-straight'].arrowheads.end = 'tampered'
    expect(CONNECTOR_SPECS['arrow-elbow'].arrowheads.end).toBe('arrow')
    CONNECTOR_SPECS['arrow-straight'].arrowheads.end = 'arrow'
  })

  it('keeps a fallback for an unrecognised tool, outside the menu', () => {
    // The old duplicate `straight` key was this, but it also showed up in
    // Object.keys and so counted as a seventh tool.
    expect(FALLBACK_CONNECTOR).toBe(CONNECTOR_SPECS['arrow-straight'])
    expect(CONNECTOR_TYPES).not.toContain('straight')
  })

  it('collides with no block shape type, which is why the ids are namespaced', () => {
    // Sharing the id `arrow` once made every block arrow commit as a connector,
    // and `line` is also the whiteboard's own line tool.
    expect(CONNECTOR_TYPES).not.toContain('arrow')
    expect(CONNECTOR_TYPES).not.toContain('line')
  })
})
