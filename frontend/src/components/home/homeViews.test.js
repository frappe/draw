import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  isPinned,
  pinnedOnly,
  unpinned,
  DEFAULT_LAYOUT,
  readLayout,
  writeLayout,
  EMPTY_HOME,
  searchDiagrams,
  sortDiagrams,
  defaultDirection,
  SORTS,
  DEFAULT_SORT,
  NO_MATCHES,
  emptyStateFor,
} from './homeViews.js'

// Browser-free (node env, no @vue/test-utils): assert the MODEL the home page
// renders and the pin FILTERS its list uses, then source-check that the SFCs
// actually bind that model — a regression guard against the old nav / inline filters
// creeping back. Mirrors ShareMenu.test.js (import the model, string-check the SFC).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const tileGrid = read('TileGrid.vue')
const diagramTile = read('DiagramTile.vue')
const homeShell = read('../../pages/HomeShell.vue')

// #407: Home showed a row of tabs — Home · Recent · Shared with you · Pinned ·
// Trash — over a page that is already the whole library. The tabs are gone; the
// app menu carries Trash, the one view Home does not contain.
describe('the home page has no view switcher (#407)', () => {
  it('drops the tab row from the top bar', () => {
    expect(homeShell).not.toContain('TabButtons')
    expect(homeShell).not.toContain('SIDEBAR_NAV')
  })

  it('keeps Trash reachable from the app menu', () => {
    expect(homeShell).toContain("label: 'Trash'")
    expect(homeShell).toContain("view.value = 'trash'")
  })

  it('leads back out of Trash with a breadcrumb, not a tab', () => {
    // Otherwise Trash is a room with no door: the menu can only take you in.
    expect(homeShell).toContain('<Breadcrumbs')
    expect(homeShell).toContain("view.value = 'home'")
  })

  it('leaves the grid with a single view to render', () => {
    // The mode prop and the per-mode lists went with the tabs.
    expect(tileGrid).not.toContain('props.mode')
    expect(tileGrid).not.toContain('modeList')
    expect(tileGrid).not.toContain('shared_with_me')
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
  it('TileGrid partitions the list through the shared pin predicates', () => {
    expect(tileGrid).toContain('pinnedOnly')
    expect(tileGrid).toContain('unpinned')
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
describe('empty states (#220)', () => {
  it('invites a first-time user to start, rather than reporting emptiness', () => {
    const home = emptyStateFor()
    expect(home.title).toBe('Start a drawing')
    expect(home.hint).toMatch(/create/i)
  })

  it('says it was the filter when a search or chip matched nothing', () => {
    // "Start a drawing" would be wrong when the library does have diagrams and
    // the query is what excluded them.
    expect(emptyStateFor(true)).toEqual(NO_MATCHES)
    expect(emptyStateFor(true).title).toBe('No diagrams match')
  })

  it('gives every state a complete lucide class', () => {
    // Tailwind's JIT only emits classes it reads literally (#292).
    for (const state of [EMPTY_HOME, NO_MATCHES]) {
      expect(state.icon).toMatch(/^lucide-[a-z0-9-]+$/)
    }
  })

  it('drops the end-of-list marker from Home', () => {
    expect(tileGrid).not.toContain("You've reached the end")
    expect(tileGrid).not.toContain('made with Frappe Draw')
  })

  it('drives the empty view from the shared model', () => {
    expect(tileGrid).toContain('emptyStateFor(hasActiveFilter.value)')
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
    // The pin lane stays — the rows still have a pin button. It is w-7 since #449
    // item 11 made that button a frappe-ui Button, which is 28px at size sm; the
    // lane and the control it holds have to be the same width or the headings sit
    // off their columns.
    expect(tileGrid).toContain('<span class="w-7 flex-none" />')
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

// #449 items 4/5. Both rules are pure functions over rows, so what the toolbar
// promises can be pinned without mounting the grid: the search narrows the list
// and clearing it restores every row, the sort actually reorders, and the two
// compose.
const LIBRARY = [
  { name: 'a', title: 'Quarterly roadmap', modified: '2026-08-14 10:00:00', creation: '2026-08-01 09:00:00' },
  { name: 'b', title: 'onboarding flow', modified: '2026-08-15 08:00:00', creation: '2026-07-02 09:00:00', is_pinned: 1 },
  { name: 'c', title: 'Billing states', modified: '2026-08-10 12:00:00', creation: '2026-08-09 09:00:00' },
]
const titles = (rows) => rows.map((row) => row.title)

describe('searchDiagrams', () => {
  it('keeps only the diagrams whose name contains the query', () => {
    expect(titles(searchDiagrams(LIBRARY, 'flow'))).toEqual(['onboarding flow'])
  })

  it('ignores case and surrounding spaces', () => {
    expect(titles(searchDiagrams(LIBRARY, '  ROADMAP '))).toEqual(['Quarterly roadmap'])
  })

  it('restores the whole list when the query is cleared', () => {
    expect(searchDiagrams(LIBRARY, '')).toHaveLength(LIBRARY.length)
    expect(searchDiagrams(LIBRARY, '   ')).toHaveLength(LIBRARY.length)
  })

  it('returns nothing when nothing matches, so the empty state can speak', () => {
    expect(searchDiagrams(LIBRARY, 'zzz')).toEqual([])
  })

  it('survives a row with no title', () => {
    expect(searchDiagrams([{ name: 'x' }], 'a')).toEqual([])
  })
})

describe('sortDiagrams', () => {
  it('orders by name A to Z, and Z to A the other way', () => {
    expect(titles(sortDiagrams(LIBRARY, 'title', 'asc'))).toEqual([
      'Billing states',
      'onboarding flow',
      'Quarterly roadmap',
    ])
    expect(titles(sortDiagrams(LIBRARY, 'title', 'desc'))[0]).toBe('Quarterly roadmap')
  })

  it('orders by last edited and by created, newest first', () => {
    expect(titles(sortDiagrams(LIBRARY, 'modified', 'desc'))[0]).toBe('onboarding flow')
    expect(titles(sortDiagrams(LIBRARY, 'creation', 'desc'))[0]).toBe('Billing states')
  })

  it('puts pinned first under Smart, then most recently edited', () => {
    expect(titles(sortDiagrams(LIBRARY, 'smart'))[0]).toBe('onboarding flow')
  })

  it('never sorts the caller\'s array in place', () => {
    const rows = [...LIBRARY]
    sortDiagrams(rows, 'title', 'asc')
    expect(titles(rows)).toEqual(titles(LIBRARY))
  })

  it('works on the result of a search, so the two controls compose', () => {
    const found = searchDiagrams(LIBRARY, 'o')
    expect(titles(sortDiagrams(found, 'title', 'asc'))).toEqual([
      'onboarding flow',
      'Quarterly roadmap',
    ])
  })
})

describe('the sort options the toolbar offers', () => {
  it('defaults to a key it actually offers', () => {
    expect(SORTS.some((option) => option.key === DEFAULT_SORT)).toBe(true)
  })

  it('reads names A to Z and everything else newest first', () => {
    expect(defaultDirection('title')).toBe('asc')
    expect(defaultDirection('modified')).toBe('desc')
    expect(defaultDirection('creation')).toBe('desc')
  })

  it('names every option, so the bar can show which one is on', () => {
    expect(SORTS.every((option) => option.key && option.label)).toBe(true)
  })
})
