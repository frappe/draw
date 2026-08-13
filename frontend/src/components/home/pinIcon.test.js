import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const icon = read('./PinIcon.vue')
const tile = read('./DiagramTile.vue')

// #412: the pinned pin was a `lucide-pin` span with `fill-current` added. frappe-ui
// renders a lucide class as a MASK tinted with background-color: currentColor, so
// there is no fill to set — the glyph stayed an outline and only changed hue.
describe('the pinned pin (#412)', () => {
  it('fills the glyph rather than asking a mask to fill itself', () => {
    expect(icon).toContain("pinned ? 'currentColor' : 'none'")
    expect(tile, 'fill-current does nothing to a masked icon').not.toContain('fill-current')
    expect(tile, 'the lucide class is the mask that could not be filled').not.toContain('lucide-pin')
  })

  // Two states of one mark, not two different marks: the filled pin is lucide's own
  // pin geometry painted instead of stroked.
  it('draws both states from the same path', () => {
    expect((icon.match(/<path/g) || []).length).toBe(2)
    expect(icon).toContain('M12 17v5')
    expect(icon, 'the outline is no longer lucide pin.svg').toContain('M9 10.76a2 2 0 0 1-1.11 1.79')
  })

  // Chrome stays neutral (CONVENTIONS 4). Amber was the other half of the report.
  it('drops the amber tint for a neutral one', () => {
    expect(tile).not.toContain('text-ink-amber')
    expect(tile).toContain('text-ink-gray-8')
  })

  it('is used by both the list row and the tile', () => {
    expect((tile.match(/<PinIcon/g) || []).length).toBe(2)
  })
})
