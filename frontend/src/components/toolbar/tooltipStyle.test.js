import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #497: two tooltip styles on the same screen — the toolbar's dark rounded pill,
// and the OS drawing a flat grey box wherever the pointer happened to be, about a
// second late. The second is the native `title` attribute, which cannot be styled,
// positioned or timed.
//
// `TabButtons` is the source of the drift: it sets `:title` on any option it
// renders ICON-ONLY, and nothing a consumer passes can turn that off. So the only
// way off the native path is off the component — which is what this guards for the
// canvas controls the report was about.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) =>
  readFileSync(path.resolve(here, '../..', rel), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('the canvas annotation tools use the app’s own tooltip (#497)', () => {
  const source = read('components/floating/WhiteboardTools.vue')
  const template = source.slice(source.indexOf('<template>'))

  it('builds the pen/highlighter toggle without TabButtons', () => {
    expect(source).not.toContain('<TabButtons')
    expect(source).toContain('<Tooltip')
  })

  it('sets no native title anywhere in the tools', () => {
    expect(template).not.toContain(':title=')
  })

  it('carries its own provider, since a popover teleports out of the toolbar’s', () => {
    // Without one the tooltips match the bar's in looks but each waits out its own
    // delay, which is the half of this that is easy to miss.
    expect(template).toContain('<TooltipProvider>')
  })

  it('keeps the toggle a toggle for assistive tech, not just in paint', () => {
    expect(template).toContain(':aria-pressed="ui.state.drawKind === kind.key"')
    expect(template).toContain(':aria-label="kind.label"')
  })
})

// Home's view toggle had the same defect and was not in the report — its options
// carry `icon`, which TabButtons renders icon-only, so it took a native title by
// the same rule. Fixed on Vibhav's call (16 Aug 2026) so both surfaces match.
describe('Home’s view toggle is on the same tooltip (#497)', () => {
  const source = read('components/home/TileGrid.vue')
  const template = source.slice(source.indexOf('<template>'))

  it('builds the tile/list toggle without TabButtons', () => {
    expect(source).not.toContain('<TabButtons')
    expect(template).toContain('<TooltipProvider>')
  })

  it('keeps it icon-only, and still named for assistive tech', () => {
    expect(template).toContain(':aria-label="option.label"')
    expect(template).toContain(':aria-pressed="view === option.value"')
  })
})
