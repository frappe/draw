import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #495: three palettes, not one. `espressoPalette` was the standard, but
// `SWATCH_PALETTE` (mind-map and flowchart fill/border, the quick swatches) and the
// whiteboard's own `CHALK_COLORS` (pen, line, table) were near-misses of it — its
// red was #E24C4C against Espresso's #E03636, its green #1F9D57 against #30A66D.
//
// This guards the RESULT rather than each call site: no second palette exists to
// reach for. Sticky-note paper colours are the one deliberate exception.
const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '..')

function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(vue|js)$/.test(entry) && !entry.endsWith('.test.js')) out.push(full)
  }
  return out
}

const read = (file) =>
  readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('one colour palette across the app (#495)', () => {
  it('has no second palette module left to import', () => {
    expect(existsSync(path.join(SRC, 'diagram/palette.js')), 'SWATCH_PALETTE is back').toBe(false)
    expect(existsSync(path.join(SRC, 'components/floating/SwatchGrid.vue'))).toBe(false)
  })

  it('leaves no component reading a colour list of its own', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /SWATCH_PALETTE|CHALK_COLORS|PEN_COLORS/.test(read(file)))
      .map((file) => path.relative(SRC, file))
    expect(offenders).toEqual([])
  })

  it('keeps the sticky-note paper colours out of it, deliberately', () => {
    // Six named note-paper fills from the spec, not ink — and contrastInk() picks
    // the text colour from them. Explicitly out of scope in the issue.
    const colors = read(path.join(SRC, 'diagram/whiteboardColors.js'))
    expect(colors).toContain('STICKY_COLORS')
  })

  it('keeps one default ink rather than a list nothing renders', () => {
    // PEN_COLORS existed only to supply [0] while CHALK_COLORS was what appeared.
    const colors = read(path.join(SRC, 'diagram/whiteboardColors.js'))
    expect(colors).toContain('DEFAULT_INK')
  })

  it.each([
    ['mind-map fill / branch / border', 'components/toolbar/groups/MindmapStyleGroup.vue'],
    ['flowchart fill / border', 'components/toolbar/groups/FlowchartNodeGroup.vue'],
    ['whiteboard line colour', 'components/floating/LineOptions.vue'],
    ['table colour', 'components/floating/TableOptions.vue'],
    ['pen and highlighter ink', 'components/floating/WhiteboardTools.vue'],
  ])('opens the shared grid for %s', (_name, file) => {
    expect(read(path.join(SRC, file))).toContain('EspressoSwatchGrid')
  })
})
