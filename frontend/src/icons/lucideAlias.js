// Single source of truth for legacy feather-icon name → current lucide name.
// Frappe Draw historically used feather-icons names; frappe-ui 1.0 ships lucide.
// Most names are identical between the two packs, so this map only lists the
// ones lucide renamed (or where the closest lucide glyph has a different name).
// Both LucideIcon.vue (runtime) and scripts/gen-lucide-nodes.mjs (build) read
// this, so a name resolves to the same glyph in the bundle and at render time.
export const LUCIDE_ALIAS = {
  // shape / name renames
  home: 'house',
  'more-horizontal': 'ellipsis',
  'more-vertical': 'ellipsis-vertical',
  edit: 'square-pen',
  'edit-2': 'pencil',
  'edit-3': 'pen-line',
  filter: 'funnel',
  'git-commit': 'git-commit-horizontal',
  grid: 'grid-2x2',
  layout: 'panels-top-left',
  sliders: 'sliders-horizontal',
  unlock: 'lock-open',
  columns: 'columns-2',
  rows: 'rows-2',
  'flip-horizontal': 'flip-horizontal-2',
  'flip-vertical': 'flip-vertical-2',
  // *-circle / *-triangle / *-square reorderings (lucide moved the shape first)
  'alert-circle': 'circle-alert',
  'alert-triangle': 'triangle-alert',
  'alert-octagon': 'octagon-alert',
  'play-circle': 'circle-play',
  'pause-circle': 'circle-pause',
  'stop-circle': 'circle-stop',
  'check-circle': 'circle-check',
  'x-circle': 'circle-x',
  'plus-circle': 'circle-plus',
  'minus-circle': 'circle-minus',
  'help-circle': 'circle-help',
  'x-square': 'square-x',
  'check-square': 'square-check',
  // charts
  'bar-chart-2': 'chart-column',
  'bar-chart': 'chart-no-axes-column',
  'pie-chart': 'chart-pie',
  // text align (feather align-* are text-alignment glyphs)
  'align-left': 'text-align-start',
  'align-center': 'text-align-center',
  'align-right': 'text-align-end',
  'align-justify': 'text-align-justify',
}
