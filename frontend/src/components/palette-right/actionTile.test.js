import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #472: the Arrange menu's tiles show their icon only. Browser-free node env, so
// this is source inspection, the house pattern for these components.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')

const SECTIONS = ['ArrangeSection', 'AlignSection', 'DistributeSizeSection', 'TransformSection']
const iconsDir = path.join(here, '../../../node_modules/lucide-static/icons')

// Every ActionTile across all four sections, as [icon, label].
function allTiles() {
  const tiles = []
  for (const section of SECTIONS) {
    for (const [, icon, label] of read(`./${section}.vue`).matchAll(
      /<ActionTile[^>]*icon="([^"]+)"[^>]*label="([^"]+)"/g,
    )) {
      tiles.push({ icon, label, section })
    }
  }
  return tiles
}

describe('the Arrange menu tiles are icon-only (#472)', () => {
  const tile = read('./ActionTile.vue')

  // frappe-ui renders an icon-only button from `icon` and keeps `label` as the
  // aria-label, so the words come off the screen without coming out of the
  // accessibility tree.
  it('renders the icon alone, with the label left as the accessible name', () => {
    expect(tile).toContain(':icon="icon"')
    expect(tile).not.toContain(':icon-left="icon"')
    expect(tile).toContain(':label="label"')
    expect(tile).toContain(':tooltip="label"')
  })

  // #294 grew the tile to fit readable text and #267 laid them two-per-row because
  // "Backward" and "To front" truncate in three columns. With the words gone both
  // constraints lift — and if the grid ever goes back to two columns, the tiles are
  // icons floating in half-empty rows.
  it('tightens the grid now that no tile has to fit a word', () => {
    for (const section of SECTIONS) {
      expect(read(`./${section}.vue`), `${section} still lays out for labels`).toContain('grid-cols-4')
    }
    expect(read('../toolbar/groups/ArrangeGroup.vue')).toContain('w-[200px]')
  })

  it('covers every tile in all four sections', () => {
    // 22 at the time of writing; the point is that one shared component reaches
    // them all, so no section keeps a labelled variant of its own.
    expect(allTiles().length).toBeGreaterThanOrEqual(22)
    for (const section of SECTIONS) {
      expect(read(`./${section}.vue`), `${section} does not use the shared tile`).toContain('ActionTile')
    }
  })
})

// Without labels the icon is the whole of the control, so two tiles wearing the
// same one is no longer a small problem.
describe('every tile icon is real and distinct (#472)', () => {
  const tiles = allTiles()

  it('uses icons that exist in the pack', () => {
    for (const { icon, label } of tiles) {
      const name = icon.replace('lucide-', '')
      expect(
        existsSync(path.join(iconsDir, `${name}.svg`)),
        `${icon} (${label}) is not in the pack — the tile renders blank`,
      ).toBe(true)
    }
  })

  it('gives no two tiles the same icon', () => {
    const seen = new Map()
    for (const { icon, label } of tiles) {
      expect(seen.has(icon), `${icon} is on both "${seen.get(icon)}" and "${label}"`).toBe(false)
      seen.set(icon, label)
    }
  })

  // The three the issue named. Middle was a bare dash; Width / Height / Same size
  // were three near-identical arrow glyphs for three unrelated operations.
  it('drops the icons that said nothing once the words came off', () => {
    const icons = tiles.map((t) => t.icon)
    expect(icons).not.toContain('lucide-minus')
    expect(icons).not.toContain('lucide-move-horizontal')
    expect(icons).not.toContain('lucide-move-vertical')
    expect(icons).not.toContain('lucide-maximize')
  })

  // Aligning shapes is not aligning text, and TextGroup uses the text set for real
  // text alignment — so the two menus wore the same three icons for different jobs.
  it('aligns with the object-alignment set, not the text one', () => {
    const align = read('./AlignSection.vue')
    expect(align).toContain('lucide-align-start-vertical')
    expect(align).toContain('lucide-align-center-horizontal')
    expect(align).not.toContain('lucide-text-align')
    expect(read('../toolbar/groups/TextGroup.vue')).toContain('lucide-text-align-start')
  })

  // Guides moved to lucide-grip in #458, but grid-2x2 still means mind-map layout
  // in MapLayoutGroup, so the Grid tile had to move rather than reclaim it.
  it('keeps the Grid tile off the mind-map layout icon', () => {
    expect(read('./DistributeSizeSection.vue')).toContain('icon="lucide-layout-grid"')
    expect(read('../toolbar/groups/MapLayoutGroup.vue')).toContain('lucide-grid-2x2')
  })
})
