// Home view model (#116): the sidebar's navigation set, the per-view page titles,
// and the pin predicates its views filter on. Kept in one plain module — not inside
// the SFCs — so the sidebar / shell / grid stay declarative and the unit tests can
// assert the view set and filters without mounting (browser-free) components.
//
// Nav is a flat list (no folders, #115): Home · Recent · Shared with you · Pinned ·
// Trash. "All diagrams" was dropped in favour of the more useful Shared + Pinned.

import { readJson, writeJson } from '@/utils/localStore.js'

// `icon` holds the COMPLETE lucide utility class, not a bare name. Tailwind's
// JIT only emits classes it can read literally in the source, so a template like
// `lucide-${name}` produces no CSS and the icon renders blank — it happens to
// work only when frappe-ui itself uses the same class somewhere.
export const SIDEBAR_NAV = [
  { key: 'home', label: 'Home', icon: 'lucide-house' },
  { key: 'recent', label: 'Recent', icon: 'lucide-clock' },
  { key: 'shared', label: 'Shared with you', icon: 'lucide-share-2' },
  { key: 'pinned', label: 'Pinned', icon: 'lucide-pin' },
  { key: 'trash', label: 'Trash', icon: 'lucide-trash-2' },
]

// Page heading per view. Trash is intentionally absent — it renders its own
// TrashView (with its own header), so the shell never shows a title for it.
export const VIEW_TITLES = {
  home: 'Home',
  recent: 'Recent',
  shared: 'Shared with you',
  pinned: 'Pinned',
}

// What each tab says when it has nothing to show (#220). One entry per view,
// because "empty" means something different in each. Home is the only one that
// reads as an invitation rather than a report: the Create button is right there,
// and a first-time user lands here with nothing.
//
// There is deliberately no end-of-list marker to pair with these. Home used to
// close every populated view with "You've reached the end", which said nothing a
// user could act on and read as an empty state to anyone who met it first.
export const EMPTY_STATES = {
  home: { icon: 'lucide-feather', title: 'Start a drawing', hint: 'Use Create to make your first one.' },
  recent: { icon: 'lucide-clock', title: 'Nothing recent', hint: 'Diagrams you open show up here.' },
  shared: { icon: 'lucide-share-2', title: 'Nothing shared with you', hint: 'Diagrams others share with you show up here.' },
  pinned: { icon: 'lucide-pin', title: 'No pinned diagrams', hint: 'Pin a diagram to keep it handy here.' },
}

// A search that matches nothing is about the search, not the tab, so it wins.
export function emptyStateFor(mode, hasActiveFilter = false) {
  if (hasActiveFilter) {
    return { icon: 'lucide-search', title: 'No diagrams match', hint: 'Try a different search.' }
  }
  return EMPTY_STATES[mode] || EMPTY_STATES.home
}

// Pin state is a single doc flag (is_pinned). The predicate is used in three places
// — the Home "Pinned" group, the "everything else" group, and the sidebar "Pinned"
// view — so it lives here once rather than inline thrice.
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
