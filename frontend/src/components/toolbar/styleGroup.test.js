import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { supportsCornerRounding } from '@/diagram/shapeGeometry.js'

// This repo keeps unit tests browser-free (node env, no @vue/test-utils), so the
// markup contract is asserted by source inspection, the way canvasToolbar.test.js
// does. The behaviour underneath is pinned in shapeGeometry.test.js.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'groups/StyleGroup.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>'))

// #465: the Corners popover used to hold two controls — a node's branch curve and a
// box shape's fixed radius steps. #451 gave a box shape a corner DRAG HANDLE and
// left the steps in place, so one value had two controls and the bar carried an
// entry it no longer needed. The handle won.
describe('the Corners popover', () => {
  it('opens for a mind-map node and nothing else', () => {
    expect(template).toContain('v-if="isNodeSelection"')
    expect(template).not.toContain('isRoundedBoxSelection')
  })

  it('holds the curve tabs alone, with no radius steps beside them', () => {
    expect(template).toContain('<TabButtons')
    expect(template).not.toContain('CORNER_RADIUS_OPTIONS')
    expect(template).not.toContain('setBoxCornerRadius')
  })

  // The steps were the only hand-built control in this file. With them gone the
  // exemption goes too, so nothing here escapes the frappe-ui rule any more.
  it('leaves no hand-built swatch behind', () => {
    expect(source).not.toContain('frappe-ui-exempt')
    expect(source).not.toContain('PREVIEW_SCALE')
  })
})

// #473: the Fill swatch was a white disc inside a grey ring, built the same way as
// the Border swatch and differing only in line weight — so it read as a second
// border control. It is a solid disc now.
describe('the Fill button swatch', () => {
  // Comments are stripped before matching: the one above the swatch explains what it
  // no longer is, and naming the old treatment must not fail the check for it.
  const markupOnly = (text) => text.replace(/<!--[\s\S]*?-->/g, '')

  it('draws a solid disc, with no outline to make it read as a border', () => {
    const fill = markupOnly(template.slice(template.indexOf('label="Fill"'), template.indexOf('label="Border"')))
    expect(fill).toContain('rounded-full')
    expect(fill, 'an outline puts the border reading back').not.toMatch(/\bborder/)
    // The Border swatch is the one that stays a ring — that contrast is the signal.
    const border = template.slice(template.indexOf('label="Border"'))
    expect(border).toContain('border-[3px]')
  })

  // A white disc on a white toolbar is an invisible button, so white and "no fill"
  // both fall back to a visible grey.
  it('falls back to grey when there is no fill to show', () => {
    expect(source).toContain("const WHITES = ['#fff', '#ffffff', 'white']")
    expect(template).toContain("hasVisibleFill ? null : 'bg-surface-gray-4'")
  })
})

// supportsCornerRounding still gates the DRAG HANDLE in SelectionLayer, which is now
// the only way to round a box shape.
describe('which shapes take the corner-rounding handle', () => {
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
