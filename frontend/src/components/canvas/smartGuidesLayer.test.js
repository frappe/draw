import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #471: the pink alignment guide draws as a line only. Browser-free node env, so
// the markup contract is asserted by source inspection, the house pattern here.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'SmartGuidesLayer.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>'))

describe('the alignment guide is a line, with no label (#471)', () => {
  it('still draws the pink dashed line', () => {
    expect(template).toContain('stroke="#E34AA6"')
    expect(template).toContain('stroke-dasharray="4 3"')
  })

  // The line already shows what it is showing; the word only added something to
  // read mid-drag.
  it('draws no pill on it', () => {
    expect(template, 'the guide pill is back').not.toContain('v-if="guide.label"')
    expect(template).not.toContain('pillWidth')
  })

  // Four helpers existed only to size and place that pill. Left behind they would
  // read as live geometry.
  it('leaves none of the pill geometry behind', () => {
    for (const dead of ['PILL_HEIGHT', 'PILL_PADDING', 'CHAR_WIDTH', 'function pillX', 'function pillY']) {
      expect(source, `${dead} is dead now the pill is gone`).not.toContain(dead)
    }
  })

  // The BLUE number reports the real gap between two shapes, which the line alone
  // cannot show. It was never the thing being removed, and it has its own pill
  // helper that must survive.
  it('keeps the blue distance measurement and its badge', () => {
    expect(template).toContain('stroke="#3B82F6"')
    expect(source).toContain('function measurePillW')
    expect(source).toContain('const M_PILL_H')
  })
})
