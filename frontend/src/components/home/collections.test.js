import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #217. Collections are LABELS, not folders: a diagram belongs to as many as you
// like and is never moved. Folders were removed in #115 because they clashed with
// Drive's own foldering, and that clash only returns if a diagram can be in exactly
// one place — so the "several at once" property is the point, not a detail.
//
// Browser-free source checks, the way the other Home components are covered.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const chips = read('CollectionChips.vue')
const picker = read('CollectionPicker.vue')
const tileGrid = read('TileGrid.vue')
const diagramTile = read('DiagramTile.vue')
const dataLayer = read('../../data/collections.js')

// Assert on MARKUP, not on the prose around it: comments explaining why there is
// no wrapping <label> must not fail the test that checks there is none.
const templateOf = (sfc) =>
  sfc.slice(sfc.indexOf('<template>')).replace(/<!--[\s\S]*?-->/g, '')

describe('the collection chip row (#217)', () => {
  it('filters the same list rather than navigating into anything', () => {
    // A label is something you filter by, not a place you go into — so no route,
    // no breadcrumb, no drill-in.
    expect(chips).not.toMatch(/router|route\.|breadcrumb/i)
    expect(tileGrid).toContain('matchesCollection')
    expect(tileGrid).toContain('collectedNames')
  })

  it('toggles the filter off when the active chip is clicked again', () => {
    expect(chips).toContain("emit('select', props.active === name ? '' : name)")
  })

  it('marks the active chip for assistive tech, not just visually', () => {
    expect(chips).toContain(':aria-pressed="active === collection.name"')
  })

  it('never nests one button inside another', () => {
    // The delete "x" used to be a role=button span inside the chip button, which is
    // invalid and unreachable by keyboard. Two siblings in a wrapper instead.
    expect(chips).not.toMatch(/role="button"/)
    expect(chips).toContain(':aria-label="`Delete ${collection.title}`"')
  })

  it('shows only on Home, where the whole library is', () => {
    // Recent / Shared / Pinned are already answers to "which diagrams"; a second
    // filter stacked on them reads as a bug.
    expect(tileGrid).toContain("const showsCollections = computed(() => props.mode === 'home')")
    expect(tileGrid).toContain('v-if="showsCollections"')
  })

  it('says what a delete does and does not do', () => {
    expect(chips).toMatch(/stay in your library/)
  })
})

describe('filing a diagram into collections (#217)', () => {
  it('offers checkboxes, so a diagram can be in several at once', () => {
    expect(templateOf(picker)).toContain('<Checkbox')
    expect(picker).toContain('memberOf')
    // Not a single choice, and not a move: both endpoints are add/remove.
    expect(templateOf(picker)).not.toMatch(/Radio|Select/)
    expect(picker).toContain('addToCollection')
    expect(picker).toContain('removeFromCollection')
  })

  it("names each box with Checkbox's own label prop", () => {
    // A wrapping <label> around a component that renders its own input does not
    // associate them, which leaves the box with no accessible name.
    expect(picker).toContain(':label="collection.title"')
    expect(templateOf(picker)).not.toMatch(/<label\b/)
  })

  it('puts the tick back if the write fails', () => {
    // It moves the tick before the round trip, so a failure has to undo it or the
    // dialog lies about where the diagram is.
    expect(picker).toContain('const reverted = new Set(memberOf.value)')
    expect(picker).toContain('toast.error')
  })

  it('is reachable from a tile, and adds rather than moves', () => {
    expect(diagramTile).toContain("emit('collect', props.diagram)")
    expect(diagramTile).toContain("label: 'Add to collection'")
  })

  it('uses the modern Dialog API, not the deprecated one (#298)', () => {
    expect(picker).toContain('v-model:open="open"')
    expect(picker).not.toContain('#body-content')
  })
})

describe('the collections data layer (#217)', () => {
  it('degrades to an empty list rather than breaking Home', () => {
    // Home must render even when the endpoint is unreachable.
    const reads = dataLayer.match(/export async function \w+[\s\S]*?\n}/g) || []
    expect(reads.length).toBeGreaterThanOrEqual(3)
    for (const fn of reads) expect(fn).toContain('catch')
  })

  it('calls the collection endpoints by their dotted paths', () => {
    for (const method of [
      'list_collections',
      'create_collection',
      'rename_collection',
      'delete_collection',
      'diagrams_in_collection',
      'collections_of',
      'add_to_collection',
      'remove_from_collection',
    ]) {
      expect(dataLayer).toContain(`draw.api.collection.${method}`)
    }
  })
})
