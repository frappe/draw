// Whiteboard color palettes (Espresso only — CONVENTIONS cardinal rule 1). The
// pen/highlighter swatches and the sticky-note swatches both draw from these
// curated Espresso values. Number keys 1-9 pick by index (spec C3/W4), so order
// is stable and meaningful.

// Pen + highlighter ink colors (ink-dark first so the default reads well).
export const PEN_COLORS = [
  '#171717', // gray-900 (default ink)
  '#E03636', // red-500
  '#DB7706', // amber-600
  '#30A66D', // green-600
  '#006EDB', // blue-600
  '#6846E3', // violet-500
  '#E34AA6', // pink-500
  '#0B9E92', // teal-600
  '#7C7C7C', // gray-600
]

// Sticky-note fills (soft Espresso tints so dark text stays legible).
export const STICKY_COLORS = [
  '#FFF7D3', // amber-100 (default)
  '#DFFCE8', // green-100
  '#DAEAFF', // blue-100
  '#FFE7E7', // red-100
  '#EFEAFE', // violet tint
  '#FCEAF5', // pink tint
  '#E7F8FB', // cyan tint
  '#F3F3F3', // gray-100
  '#FEEDA9', // amber-200
]

export const PEN_WIDTHS = [2, 4, 8]
export const HIGHLIGHTER_WIDTH = 18
export const HIGHLIGHTER_OPACITY = 0.4

// Relative luminance (sRGB) of a #rrggbb color, used for auto-contrast text.
function luminance(hex) {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Pick near-black or white ink so sticky-note text stays readable on any fill
// (spec C3/C10 auto-contrast).
export function contrastInk(backgroundHex) {
  return luminance(backgroundHex) > 0.5 ? '#171717' : '#FFFFFF'
}
