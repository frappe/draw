// Home view model (#116): the empty states, the pin predicates the grid filters
// on, and the stored layout choice. Kept in one plain module — not inside the SFCs
// — so the shell and grid stay declarative and the unit tests can assert the model
// without mounting (browser-free) components.
//
// Home is the only listing view (#407): one flat, pinnable list of every diagram
// (no folders, #115), with Trash reached from the app menu.

import { readJson, writeJson } from '@/utils/localStore.js'

// `icon` holds the COMPLETE lucide utility class, not a bare name. Tailwind's
// JIT only emits classes it can read literally in the source, so a template like
// `lucide-${name}` produces no CSS and the icon renders blank — it happens to
// work only when frappe-ui itself uses the same class somewhere.
//
// An empty Home reads as an invitation rather than a report: the Create button is
// right there, and a first-time user lands here with nothing. A search that
// matches nothing is about the search, so it says so instead.
//
// There is deliberately no end-of-list marker to pair with these (#220). Home used
// to close a populated list with "You've reached the end", which said nothing a
// user could act on and read as an empty state to anyone who met it first.
export const EMPTY_HOME = {
  icon: 'lucide-feather',
  title: 'Start a drawing',
  hint: 'Use Create to make your first one.',
}
export const NO_MATCHES = {
  icon: 'lucide-search',
  title: 'No diagrams match',
  hint: 'Try a different search.',
}

export function emptyStateFor(hasActiveFilter = false) {
  return hasActiveFilter ? NO_MATCHES : EMPTY_HOME
}

// --- search + sort (#449 items 4/5) -----------------------------------------
// Both rules live here, as plain functions over rows, so the grid only holds the
// query string and the chosen key — and so a test can prove that searching and
// sorting agree with each other without mounting anything.

// A row matches when its title contains the query, case- and space-insensitively.
// An empty query matches everything, which is what makes clearing the box restore
// the whole list.
export function matchesQuery(diagram, query) {
  const wanted = (query || '').trim().toLowerCase()
  if (!wanted) return true
  return (diagram.title || '').toLowerCase().includes(wanted)
}

export function searchDiagrams(rows, query) {
  return rows.filter((diagram) => matchesQuery(diagram, query))
}

export const SORTS = [
  { key: 'smart', label: 'Smart' },
  { key: 'modified', label: 'Last edited' },
  { key: 'creation', label: 'Date created' },
  { key: 'title', label: 'Name (A–Z)' },
]
export const DEFAULT_SORT = 'modified'

// Names read A→Z; every other key is newest-first.
export function defaultDirection(key) {
  return key === 'title' ? 'asc' : 'desc'
}

// Sorted copy, never in place: the caller's array is a computed over the fetched
// rows, and sorting it where it lies mutates that cache.
export function sortDiagrams(rows, key, direction) {
  return [...rows].sort(comparator(key, direction))
}

function comparator(key, direction) {
  // Smart: surface what you'd likely want next — pinned first, then most recently
  // edited. (Without open-frequency data this is the best local heuristic; I6.)
  if (key === 'smart') {
    return (a, b) => (isPinned(b) ? 1 : 0) - (isPinned(a) ? 1 : 0) || timestamp(b.modified) - timestamp(a.modified)
  }
  const sign = direction === 'asc' ? 1 : -1
  if (key === 'title') return (a, b) => sign * (a.title || '').localeCompare(b.title || '')
  return (a, b) => sign * (timestamp(a[key]) - timestamp(b[key]))
}

function timestamp(value) {
  return value ? new Date(value.replace(' ', 'T')).getTime() : 0
}

// Pin state is a single doc flag (is_pinned). The predicate splits the shelf in
// two — the "Pinned" group and the "everything else" group — so it lives here once
// rather than inline twice.
export const isPinned = (diagram) => Boolean(diagram.is_pinned)
export const pinnedOnly = (rows) => rows.filter(isPinned)
export const unpinned = (rows) => rows.filter((diagram) => !isPinned(diagram))

// Tile or list layout (#222). This is personal chrome state, not part of a
// document, so it lives in localStorage rather than on the user's record — the
// same call as recent colours. A new user still starts in the list.
const LAYOUT_KEY = 'frappe-draw-home-layout'
export const LAYOUTS = ['list', 'tile']
export const DEFAULT_LAYOUT = 'list'

// Anything unrecognised falls back to the default. Home renders one branch per
// layout, so a stale or hand-edited value would otherwise show neither.
export function readLayout() {
  const stored = readJson(LAYOUT_KEY, DEFAULT_LAYOUT)
  return LAYOUTS.includes(stored) ? stored : DEFAULT_LAYOUT
}

export function writeLayout(layout) {
  if (!LAYOUTS.includes(layout)) return
  writeJson(LAYOUT_KEY, layout)
}
