import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The connector menu's structural contract (#490/#492/#493/#494). This repo keeps
// unit tests browser-free (node env, no @vue/test-utils), so these are asserted by
// source inspection, the same way canvasToolbar.test.js does.
//
// Everything pinned here is something that breaks silently: a control that reappears
// carrying words, a picker that goes back to asking for a hex, an icon that stops
// describing what it draws.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
// The comments in this file NAME the things these assertions say are gone — that is
// what a comment recording a removal is for — so an assertion over the raw text
// would fail on the explanation rather than on the code. Strip both comment forms
// and assert against what actually ships.
const withoutComments = (text) =>
  text.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')
const templateOf = (text) => text.slice(text.indexOf('<template>'))

const source = withoutComments(read('ConnectorSection.vue'))
const template = templateOf(source)

describe('the connector menu is one kind of control throughout (#493)', () => {
  it('uses no TabButtons, so no row carries words or the native tooltip', () => {
    // TabButtons hard-codes :title internally, which is the unstyleable browser
    // tooltip (#497) — keeping it would keep that too.
    expect(source).not.toContain('TabButtons')
  })

  it('draws the dash pattern instead of naming it', () => {
    expect(template).toContain('stroke-dasharray')
    expect(template).not.toContain('>Solid<')
    expect(template).not.toContain('>Dashed<')
  })

  it('gives Corners drawn glyphs, the row that was not in the report', () => {
    // Converting only the dash row would have left the identical inconsistency
    // one line below it.
    expect(template).toContain('family="corner"')
  })

  it('leaves no native title on any control, and no silent one either', () => {
    expect(template).not.toContain(':title=')
    // Width had an aria-label but no tooltip at all, so it was mute on hover
    // while both its neighbours spoke.
    const width = template.slice(template.indexOf('Line width'))
    expect(template.slice(0, template.indexOf('Line width'))).toContain('<Tooltip')
    expect(width.length).toBeGreaterThan(0)
  })

  it('carries its own TooltipProvider, since a popover teleports out of the bar’s', () => {
    expect(template).toContain('<TooltipProvider :hover-delay="2" :skip-delay="0">')
  })
})

describe('the label field is gone (#492)', () => {
  it('offers no text input — a label is added by double-clicking the connector', () => {
    expect(source).not.toContain('TextInput')
    expect(template).not.toContain('Add label')
  })

  it('drops the setter that fed it', () => {
    // The inline editor writes the label straight through updateConnector, so
    // nothing else called this.
    expect(source).not.toContain('function setLabel')
  })
})

describe('line colour offers the palette, not a hex field (#494)', () => {
  it('uses the Espresso grid, like fill, border and text colour', () => {
    expect(source).not.toContain('ColorPicker')
    expect(template).toContain('EspressoSwatchGrid')
  })

  it('does not allow None — a connector with no stroke colour would vanish', () => {
    expect(template).toContain(':allow-none="false"')
  })

  it('keeps the default the grid can show as selected', () => {
    // #481 moved the grey family; the connector default has to remain one of the
    // swatches or the row renders with nothing selected.
    expect(source).toContain("DEFAULT_COLOR = '#7C7C7C'")
  })
})

describe('the Arrow endpoint icon matches what it draws (#490)', () => {
  it('drops the stroked Lucide arrow for a drawn glyph', () => {
    expect(source).not.toContain('lucide-arrow-right')
    expect(source).toContain("glyph: 'arrowhead'")
  })

  it('leaves the Open endpoint alone — its chevron is already honest', () => {
    expect(source).toContain("value: 'open-arrow', icon: 'lucide-chevron-right'")
  })
})
