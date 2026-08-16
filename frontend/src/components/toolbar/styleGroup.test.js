import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { CORNER_RADIUS_OPTIONS, supportsCornerRounding } from '@/diagram/shapeGeometry.js'

// This repo keeps unit tests browser-free (node env, no @vue/test-utils), so the
// markup contract is asserted by source inspection, the way canvasToolbar.test.js
// does. The behaviour underneath is pinned in shapeGeometry.test.js.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'groups/StyleGroup.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>'))

// The Corners popover holds two different controls (#411): a mind-map node's branch
// curve, and a plain rounded rectangle's roundedness. They share one entry on the
// bar, so nothing pins that they stay mutually exclusive except this.
describe('the Corners popover', () => {
  it('opens for a rounded rectangle as well as a node', () => {
    expect(template).toContain('v-if="isNodeSelection || isRoundedBoxSelection"')
  })

  it('shows the curve tabs or the radius swatches, never both', () => {
    expect(template).toMatch(/<TabButtons\s+v-if="isNodeSelection"/)
    expect(template).toMatch(/<div v-else class="flex items-center gap-1\.5">/)
  })

  it('offers one swatch per preset, and writes the radius on click', () => {
    expect(template).toContain('v-for="radius in CORNER_RADIUS_OPTIONS"')
    expect(template).toContain('@click="setBoxCornerRadius(radius)"')
  })

  // A bare <button> here is deliberate — the swatch is a preview of the radius
  // itself, which no frappe-ui Button variant can draw. The comment is the record
  // of that, and CONVENTIONS requires it on the same line as the control.
  it('states why its swatch is not a frappe-ui Button', () => {
    expect(template).toMatch(/<!-- frappe-ui-exempt: [^>]+--><button/)
  })

  // A swatch is a control, so it needs a name and a pressed state — the popover has
  // no visible labels, only four boxes.
  it('names each swatch and marks the active one', () => {
    expect(template).toContain(':aria-label="`Corner radius ${radius}`"')
    expect(template).toContain(':aria-pressed="boxCornerRadius === radius"')
  })
})

describe('which shapes the roundedness picker claims', () => {
  it('takes a plain rounded rectangle', () => {
    expect(supportsCornerRounding({ type: 'rounded' })).toBe(true)
  })

  // #451 items 5/6/7: a plain rectangle is SHARP by default and rounds by dragging
  // its corner dot, so it has to be claimed too — otherwise there is no way back
  // from square, and the handle and the picker would disagree about the same shape.
  it('takes the box shapes that are sharp by default', () => {
    expect(supportsCornerRounding({ type: 'rectangle' })).toBe(true)
    expect(supportsCornerRounding({ type: 'square' })).toBe(true)
  })

  // A node is type 'rounded' too, and its corners come from the curve tabs in the
  // same popover — claiming it would put both controls on one selection.
  it('leaves a mind-map or flowchart node to its own control', () => {
    expect(supportsCornerRounding({ type: 'rounded', role: 'mindmap-node' })).toBe(false)
    expect(supportsCornerRounding({ type: 'rounded', role: 'flowchart-node' })).toBe(false)
    expect(supportsCornerRounding({ type: 'rectangle', role: 'mindmap-node' })).toBe(false)
  })

  it('leaves shapes with no corners alone', () => {
    expect(supportsCornerRounding({ type: 'ellipse' })).toBe(false)
    expect(supportsCornerRounding({ type: 'triangle' })).toBe(false)
    expect(supportsCornerRounding(undefined)).toBe(false)
  })
})

// The presets are previewed at a quarter scale: border-radius clamps to half the
// box, so at any smaller size 12, 20 and 32 all render as the same pill and three
// of the four swatches become indistinguishable.
describe('the radius previews', () => {
  it('stay below the clamp at the preview size', () => {
    const PREVIEW_HEIGHT = 24 // h-6, a quarter of a default 96-tall shape
    const scaled = CORNER_RADIUS_OPTIONS.map((radius) => radius * 0.25)
    expect(source).toContain('const PREVIEW_SCALE = 0.25')
    expect(template).toContain('class="block h-6 w-11')
    expect(Math.max(...scaled)).toBeLessThan(PREVIEW_HEIGHT / 2)
    expect(new Set(scaled).size).toBe(CORNER_RADIUS_OPTIONS.length)
  })
})
