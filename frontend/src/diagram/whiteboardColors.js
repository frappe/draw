// Whiteboard color palettes (Espresso only — CONVENTIONS cardinal rule 1). The
// pen/highlighter swatches and the sticky-note swatches both draw from these
// curated Espresso values. Order is the on-screen swatch order, so it stays stable
// and meaningful — but nothing addresses these by index any more: keyboard
// colour-picking (1-9) was removed, because the block keyboard used the same keys to
// recolour a shape and both meanings cannot hold on the unified canvas.

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

// Exactly six sticky-note fills (spec): Yellow, Green, Blue, Pink, White, Purple.
export const STICKY_COLORS = [
  '#FFF7D3', // Yellow (default)
  '#DFFCE8', // Green
  '#DAEAFF', // Blue
  '#FCEAF5', // Pink
  '#FFFFFF', // White
  '#EFEAFE', // Purple
]

// Chalk palette for the whiteboard — soft ink colors on the white board.
export const CHALK_COLORS = [
  '#171717', // charcoal (default ink)
  '#E03636', // red
  '#DB7706', // amber
  '#30A66D', // green
  '#006EDB', // blue
  '#6846E3', // violet
  '#E34AA6', // pink
  '#7C7C7C', // gray
]

export const PEN_WIDTHS = [2, 4, 8]
export const HIGHLIGHTER_WIDTHS = [10, 18, 26]
export const PEN_OPACITY = 1
export const HIGHLIGHTER_OPACITY = 0.4

// The opacity a stroke is drawn at. Read this everywhere ink is painted — the
// canvas, the export, the thumbnail and the minimap — so they cannot disagree
// (#409). Opacity is stored on the stroke at commit time, like width; a stroke
// saved before that carries none and keeps the default for its ink.
//
// The value comes out of a saved document, and useThumbnail interpolates it into
// an SVG attribute, so it is validated here rather than trusted: anything that is
// not a real number in range falls back, the same way that file treats every other
// persisted number (`num`) and colour (`safeColor`).
export function strokeOpacity(stroke) {
  const opacity = stroke?.opacity
  if (Number.isFinite(opacity)) return Math.min(1, Math.max(0, opacity))
  return defaultOpacity(stroke?.kind)
}

function defaultOpacity(kind) {
  return kind === 'highlighter' ? HIGHLIGHTER_OPACITY : PEN_OPACITY
}

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
