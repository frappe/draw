// Home view model (#116): the sidebar's navigation set, the per-view page titles,
// and the pin predicates its views filter on. Kept in one plain module — not inside
// the SFCs — so the sidebar / shell / grid stay declarative and the unit tests can
// assert the view set and filters without mounting (browser-free) components.
//
// Nav is a flat list (no folders, #115): Home · Recent · Shared with you · Pinned ·
// Trash. "All diagrams" was dropped in favour of the more useful Shared + Pinned.

export const SIDEBAR_NAV = [
  { key: 'home', label: 'Home', feather: 'home' },
  { key: 'recent', label: 'Recent', feather: 'clock' },
  { key: 'shared', label: 'Shared with you', feather: 'share-2' },
  { key: 'pinned', label: 'Pinned', feather: 'pin' },
  { key: 'trash', label: 'Trash', feather: 'trash-2' },
]

// Page heading per view. Trash is intentionally absent — it renders its own
// TrashView (with its own header), so the shell never shows a title for it.
export const VIEW_TITLES = {
  home: 'Home',
  recent: 'Recent',
  shared: 'Shared with you',
  pinned: 'Pinned',
}

// Pin state is a single doc flag (is_pinned). The predicate is used in three places
// — the Home "Pinned" group, the "everything else" group, and the sidebar "Pinned"
// view — so it lives here once rather than inline thrice.
export const isPinned = (diagram) => Boolean(diagram.is_pinned)
export const pinnedOnly = (rows) => rows.filter(isPinned)
export const unpinned = (rows) => rows.filter((diagram) => !isPinned(diagram))
