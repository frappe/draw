import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SIDEBAR_NAV, VIEW_TITLES, isPinned, pinnedOnly, unpinned } from './homeViews.js'

// Browser-free (node env, no @vue/test-utils): assert the view MODEL the home
// sidebar renders and the pin FILTERS its views use, then source-check that the SFCs
// actually bind that model — a regression guard against the old nav / inline filters
// creeping back. Mirrors ShareMenu.test.js (import the model, string-check the SFC).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const sidebar = read('Sidebar.vue')
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

  it('gives every item a feather icon', () => {
    for (const item of SIDEBAR_NAV) expect(item.feather).toBeTruthy()
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
  it('Sidebar renders SIDEBAR_NAV (not an inline nav array)', () => {
    expect(sidebar).toContain('SIDEBAR_NAV')
    expect(sidebar).not.toContain("label: 'All diagrams'")
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
