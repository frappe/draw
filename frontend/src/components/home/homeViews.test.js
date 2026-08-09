import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  SIDEBAR_NAV,
  VIEW_TITLES,
  isPinned,
  pinnedOnly,
  unpinned,
  DEFAULT_LAYOUT,
  readLayout,
  writeLayout,
  EMPTY_STATES,
  emptyStateFor,
} from './homeViews.js'

// Browser-free (node env, no @vue/test-utils): assert the view MODEL the home
// view switcher renders and the pin FILTERS its views use, then source-check that the SFCs
// actually bind that model — a regression guard against the old nav / inline filters
// creeping back. Mirrors ShareMenu.test.js (import the model, string-check the SFC).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const tileGrid = read('TileGrid.vue')
const diagramTile = read('DiagramTile.vue')
const homeShell = read('../../pages/HomeShell.vue')

describe('sidebar nav set (#116)', () => {
  it('is Home · Recent · Shared with you · Pinned · Trash, in that order', () => {
    expect(SIDEBAR_NAV.map((n) => n.key)).toEqual(['home', 'recent', 'shared', 'pinned', 'trash'])
    expect(SIDEBAR_NAV.map((n) => n.label)).toEqual([
      'Home',
      'Recent',
      'Shared with you',
      'Pinned',
      'Trash',
    ])
  })

  it('dropped "All diagrams"', () => {
    expect(SIDEBAR_NAV.some((n) => n.key === 'all' || /all diagrams/i.test(n.label))).toBe(false)
  })

  it('gives every item a complete lucide utility class', () => {
    // Not a bare icon name: Tailwind's JIT only emits classes it can read
    // literally, so building one with `lucide-${name}` yields no CSS and a
    // blank icon (#308).
    for (const item of SIDEBAR_NAV) expect(item.icon).toMatch(/^lucide-[a-z0-9-]+$/)
  })

  it('page titles cover every non-trash view', () => {
    // Trash is intentionally absent — it renders its own header.
    expect(VIEW_TITLES).toMatchObject({
      home: 'Home',
      recent: 'Recent',
      shared: 'Shared with you',
      pinned: 'Pinned',
    })
  })
})

describe('pin filters (#116)', () => {
  const rows = [
    { name: 'a', is_pinned: 1 },
    { name: 'b', is_pinned: 0 },
    { name: 'c' }, // missing flag reads as unpinned
    { name: 'd', is_pinned: 1 },
  ]

  it('isPinned reads the flag as a boolean', () => {
    expect(isPinned(rows[0])).toBe(true)
    expect(isPinned(rows[1])).toBe(false)
    expect(isPinned(rows[2])).toBe(false)
  })

  it('pinnedOnly / unpinned partition the list', () => {
    expect(pinnedOnly(rows).map((r) => r.name)).toEqual(['a', 'd'])
    expect(unpinned(rows).map((r) => r.name)).toEqual(['b', 'c'])
  })
})

describe('the SFCs bind the shared model', () => {
  it('HomeShell renders SIDEBAR_NAV (not an inline nav array)', () => {
    // The sidebar was removed in #308; the same nav model now drives the top
    // bar's view switcher, so the binding guard moved to HomeShell.
    expect(homeShell).toContain('SIDEBAR_NAV')
    expect(homeShell).not.toContain("label: 'All diagrams'")
  })

  it('HomeShell titles pages from VIEW_TITLES', () => {
    expect(homeShell).toContain('VIEW_TITLES')
  })

  it('TileGrid filters the Pinned view through the shared predicate', () => {
    expect(tileGrid).toContain('pinnedOnly')
    expect(tileGrid).toContain('unpinned')
  })

  it('TileGrid sources "Shared with you" from the whitelisted endpoint', () => {
    expect(tileGrid).toContain('draw.api.diagram.shared_with_me')
    // The old flat "all diagrams" list must be gone.
    expect(tileGrid).not.toContain('allFlat')
  })
})

// #302: the Home list is a flat, Frappe-Drive-style table — no per-row card, just a
// hairline separator + hover — with sortable, direction-aware column headers.
describe('Home list is a flat Drive-style table (#302)', () => {
  it('de-cards the list row (hairline separator, not a bordered card)', () => {
    expect(diagramTile).not.toContain('rounded-lg border px-3')
    expect(diagramTile).toContain('border-b border-outline-gray-1')
  })

  it('wires sortable, direction-aware column headers', () => {
    for (const key of ['title', 'creation', 'modified']) {
      expect(tileGrid).toContain(`setSort('${key}')`)
    }
    expect(tileGrid).toContain('sortArrow')
    expect(tileGrid).toContain('sortDir')
  })
})

// #222: the tile/list choice survives a reload. #221 rides on the same fix — a
// user who switches to tiles and is returned to the list sees no previews at all
// and reads that as thumbnails having stopped working.
describe('Home layout preference (#222)', () => {
  const original = globalThis.localStorage

  beforeEach(() => {
    const map = new Map()
    globalThis.localStorage = {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, value),
    }
  })
  afterEach(() => {
    globalThis.localStorage = original
  })

  it('starts a new user in the list', () => {
    expect(DEFAULT_LAYOUT).toBe('list')
    expect(readLayout()).toBe('list')
  })

  it('remembers a switch to tiles', () => {
    writeLayout('tile')
    expect(readLayout()).toBe('tile')
  })

  it('remembers a switch back to the list', () => {
    writeLayout('tile')
    writeLayout('list')
    expect(readLayout()).toBe('list')
  })

  it('falls back to the list when the stored value is not a layout', () => {
    // Home renders one branch per layout, so an unrecognised value would show
    // neither. A stale key from an older release must not blank the page.
    globalThis.localStorage.setItem('frappe-draw-home-layout', JSON.stringify('grid'))
    expect(readLayout()).toBe('list')
  })

  it('refuses to store a value that is not a layout', () => {
    writeLayout('tile')
    writeLayout('nonsense')
    expect(readLayout()).toBe('tile')
  })

  it('survives localStorage throwing, as in private mode', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(readLayout()).toBe('list')
    expect(() => writeLayout('tile')).not.toThrow()
  })

  it('TileGrid seeds its view from the stored layout and persists a change', () => {
    expect(tileGrid).toContain('ref(readLayout())')
    expect(tileGrid).toContain('watch(view, writeLayout)')
    // The old hardcoded default must be gone, or the preference never applies.
    expect(tileGrid).not.toContain("const view = ref('list')")
  })
})

// #221: a stored thumbnail can outlive its File. The diagram keeps the path, the
// <img> 404s, and because the raster wins over the live preview the tile showed an
// empty box for a diagram that renders fine.
describe('tile preview survives a dead thumbnail (#221)', () => {
  it('treats a failed image load as "no raster"', () => {
    expect(diagramTile).toContain('@error="thumbnailFailed = true"')
    expect(diagramTile).toContain('thumbnailFailed.value ? null')
  })

  it('retries when the diagram gets a new thumbnail path', () => {
    // Otherwise one dead path would suppress the raster for the rest of the session.
    expect(diagramTile).toMatch(/watch\(\s*\(\)\s*=>\s*props\.diagram\.thumbnail/)
  })

  it('still prefers the raster, then the live SVG, then the blank placeholder', () => {
    expect(diagramTile).toContain('v-if="thumbnailUrl"')
    expect(diagramTile).toContain('v-else-if="previewSvg"')
    expect(diagramTile).toContain('Diagram is blank')
  })
})

// #220: Home closed every populated view with "You've reached the end · made with
// Frappe Draw". It told the user nothing they could act on, and anyone who met it
// before scrolling read it as an empty state. It is gone; the empty views carry
// the message instead, worded for the tab they belong to.
describe('empty states, one per tab (#220)', () => {
  it('invites a first-time user to start, rather than reporting emptiness', () => {
    const home = emptyStateFor('home')
    expect(home.title).toBe('Start a drawing')
    expect(home.hint).toMatch(/create/i)
  })

  it('words each other tab for itself', () => {
    expect(emptyStateFor('recent').title).toBe('Nothing recent')
    expect(emptyStateFor('shared').title).toBe('Nothing shared with you')
    expect(emptyStateFor('pinned').title).toBe('No pinned diagrams')
  })

  it('covers every view the switcher offers, so none falls through', () => {
    for (const nav of SIDEBAR_NAV) {
      if (nav.key === 'trash') continue // Trash renders its own view, with its own empty state
      expect(EMPTY_STATES[nav.key], `no empty state for "${nav.key}"`).toBeTruthy()
    }
  })

  it('lets a search that matches nothing win over the tab wording', () => {
    // "No pinned diagrams" would be wrong when the tab does have pins and the
    // query is what excluded them.
    expect(emptyStateFor('pinned', true).title).toBe('No diagrams match')
    expect(emptyStateFor('home', true).title).toBe('No diagrams match')
  })

  it('falls back to Home rather than rendering an undefined icon', () => {
    expect(emptyStateFor('nonexistent-mode')).toEqual(EMPTY_STATES.home)
  })

  it('gives every state a complete lucide class', () => {
    // Tailwind's JIT only emits classes it reads literally (#292).
    for (const state of Object.values(EMPTY_STATES)) {
      expect(state.icon).toMatch(/^lucide-[a-z0-9-]+$/)
    }
  })

  it('drops the end-of-list marker from Home', () => {
    expect(tileGrid).not.toContain("You've reached the end")
    expect(tileGrid).not.toContain('made with Frappe Draw')
  })

  it('drives the empty view from the shared model', () => {
    expect(tileGrid).toContain('emptyStateFor(props.mode, hasActiveFilter.value)')
  })
})

// #218: every list row drew the same 'lucide-shapes' glyph. Types stopped being a
// user-facing concept in #114, which left one identical icon on every row — it
// distinguished nothing and only pushed the titles right.
describe('list rows carry no type glyph (#218)', () => {
  it('drops the glyph and the constant behind it', () => {
    expect(diagramTile).not.toContain("const icon = 'lucide-shapes'")
    expect(diagramTile).not.toContain('lucide-shapes')
  })

  it('drops the header spacer that reserved the glyph lane', () => {
    // The header aligns column-for-column with the rows, so a leftover spacer
    // would shift every heading one lane right of its column.
    expect(tileGrid).not.toContain('<span class="w-8 flex-none" />')
    // The pin lane stays — the rows still have a pin button.
    expect(tileGrid).toContain('<span class="w-6 flex-none" />')
  })

  it('keeps the tile view showing previews, not a glyph', () => {
    expect(diagramTile).toContain('v-if="thumbnailUrl"')
    expect(diagramTile).toContain('v-else-if="previewSvg"')
  })
})

// #223: Home used to pull every diagram's full document just so the few tiles with
// no saved raster could draw a live preview. That made the list response about nine
// times larger, and it grew with the library.
describe('Home fetches documents only where a preview needs one (#223)', () => {
  it('keeps the document out of the list query', () => {
    const listFields = tileGrid.match(/fields: \[([^\]]*)\],\n\s*filters: \{ is_trashed: 0 \}/)?.[1]
    expect(listFields, 'could not find the main list query').toBeTruthy()
    expect(listFields).not.toContain("'document'")
    expect(listFields).toContain("'thumbnail'")
  })

  it('fetches documents in one call, filtered to diagrams with no thumbnail', () => {
    expect(tileGrid).toContain("filters: { is_trashed: 0, thumbnail: ['is', 'not set'] }")
    expect(tileGrid).toContain("fields: ['name', 'document']")
  })

  it('reloads that second call after a change, since a save can clear a thumbnail', () => {
    expect(tileGrid).toContain('previewDocuments.reload()')
  })

  it('reads the source document on demand when duplicating', () => {
    // A diagram with a thumbnail has no document on its row any more.
    expect(tileGrid).toContain("call('frappe.client.get_value'")
    expect(tileGrid).toContain("fieldname: 'document'")
  })

  it('tells "not fetched yet" apart from "blank" on a tile', () => {
    // Both are falsy. Treating them the same flashes "Diagram is blank" on every
    // tile that is about to draw a preview.
    expect(diagramTile).toContain('props.diagram.document !== undefined')
    expect(diagramTile).toContain('showsBlankLabel')
    expect(diagramTile).toContain('v-else-if="showsBlankLabel"')
  })

  it('shows a stored raster without needing the document at all', () => {
    // save_thumbnail clears the thumbnail when the diagram is emptied, so a raster
    // now means real content and the old emptiness gate is unnecessary.
    expect(diagramTile).toMatch(/thumbnailUrl = computed\(\s*\(\)\s*=>\s*\n?\s*thumbnailFailed\.value \? null/)
  })
})
