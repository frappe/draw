import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #224: JPEG repeated PNG's plain image glyph, so the two raster rows were
// tellable apart only by their labels. Browser-free source check, the same way
// overflowMenu.test.js and ShareMenu.test.js inspect their SFCs.
//
// PNG is not in the FORMATS list — it is hand-built markup, because it carries the
// inline 1-4x scale selector — so its icon is read from the template separately.
const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'ExportMenu.vue'),
  'utf8',
)

const listedIcons = [...source.matchAll(/icon: '(lucide-[a-z0-9-]+)'/g)].map((m) => m[1])
const pngIcon = source.match(/class="(lucide-[a-z0-9-]+) h-4 w-4 text-ink-gray-6"/)?.[1]

describe('export format icons (#224)', () => {
  it('lists JPEG, SVG and PDF, each with its own glyph', () => {
    expect(listedIcons).toEqual(['lucide-file-image', 'lucide-code', 'lucide-file-text'])
  })

  it('gives PNG a glyph of its own too', () => {
    expect(pngIcon).toBe('lucide-image')
  })

  it('leaves no two formats sharing an icon', () => {
    const all = [pngIcon, ...listedIcons]
    expect(new Set(all).size).toBe(all.length)
  })

  it('keeps PNG and JPEG distinct, which is the bug this guards', () => {
    expect(pngIcon).not.toBe(listedIcons[0])
  })

  it('spells every icon as a complete lucide class', () => {
    // Tailwind's JIT only emits classes it can read literally in the source (#292),
    // so a bare name renders an element with no glyph in it.
    for (const icon of [pngIcon, ...listedIcons]) {
      expect(icon).toMatch(/^lucide-[a-z0-9-]+$/)
    }
  })
})
