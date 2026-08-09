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
