import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SIDEBAR_NAV, VIEW_TITLES, isPinned, pinnedOnly, unpinned } from './homeViews.js'

// Browser-free (node env, no @vue/test-utils): assert the view MODEL the home
// view switcher renders and the pin FILTERS its views use, then source-check that the SFCs
// actually bind that model — a regression guard against the old nav / inline filters
// creeping back. Mirrors ShareMenu.test.js (import the model, string-check the SFC).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const tileGrid = read('TileGrid.vue')
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
