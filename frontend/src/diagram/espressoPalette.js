// Curated Espresso colour grid for mind-map node fill/border (#274). A finite,
// well-organised set — main colour (rows) x shade (columns) — replacing the full
// HSV/hex/eyedropper picker on nodes. Values are literal canvas colours (the SVG
// canvas is the token exception, see CONVENTIONS.md §2), extracted from the
// Espresso light-mode design system. Pure data + helpers so the grid and the
// node-creation defaults share ONE source and stay unit-testable.

import { readableInk } from './mindmapColors.js'

// Nine families x six shades (light -> dark). Curated from the full 12x10 Espresso
// table: near-duplicate families (yellow~amber, cyan~teal, purple~violet) are
// dropped, and the extreme 50/800 tints omitted, so the grid stays scannable.
export const SHADE_LEVELS = [100, 300, 500, 600, 700, 900]

export const ESPRESSO_FAMILIES = [
  // The grey row ends at true black, not gray-900 (#474). Black used to sit in the
  // top row beside "No fill", where it crowded out white — and the grey family
  // stopping just short of black meant the grid offered no black at all once that
  // row was rearranged. It belongs at the dark end of the greys.
  { name: 'gray', shades: ['#F3F3F3', '#E2E2E2', '#999999', '#7C7C7C', '#525252', '#000000'] },
  { name: 'red', shades: ['#FFE7E7', '#FDC2C2', '#E03636', '#CC2929', '#B52A2A', '#6B1515'] },
  { name: 'orange', shades: ['#FFEFE4', '#FFCBA3', '#E86C13', '#D45A08', '#BD3E0C', '#6B2711'] },
  { name: 'amber', shades: ['#FFF7D3', '#FBDB73', '#E79913', '#DB7706', '#B35309', '#763813'] },
  { name: 'green', shades: ['#DFFCE8', '#B0E7C4', '#59BA8B', '#30A66D', '#278F5E', '#173B2C'] },
  { name: 'teal', shades: ['#E6F7F4', '#97DED4', '#36BAAD', '#0B9E92', '#0F736B', '#114541'] },
  { name: 'blue', shades: ['#E6F4FF', '#A7D7FD', '#0289F7', '#007BE0', '#0070CC', '#004880'] },
  { name: 'violet', shades: ['#F0EBFF', '#C9BAFB', '#6846E3', '#5F46C7', '#4F3DA1', '#392980'] },
  { name: 'pink', shades: ['#FDE8F5', '#F9B9E0', '#E34AA6', '#CF3A96', '#9C2671', '#570F3E'] },
]

// The top row beside "No fill". White only: black moved into the grey family, where
// it reads as the dark end of a scale rather than as a second neutral (#474).
//
// The row held None, White and Black, but the white swatch was a white square on a
// white panel behind a hairline, so it read as empty space and the row looked like
// two items — one of them a gap. White is the one that has to be here: it is the
// only way to say "plain white" rather than "no fill at all". It is drawn with a
// real outline in the grid, not the hairline every other swatch carries.
export const NEUTRALS = { white: '#FFFFFF' }

// The monochrome default look for a fresh node (#260): subtle gray fill + a
// slightly darker gray border, so every node reads the same until the user opts
// into colour. gray-100 fill / gray-400 border / gray-900 ink.
//
// The ink stays gray-900 even though #474 took that value out of the grid. It is
// Draw's standard ink throughout, and text colour is derived by inkFor() rather than
// picked from this grid, so nothing here offers it as a choice to begin with. A node
// that already carries it as a FILL or BORDER keeps the colour and simply shows no
// selected ring, which is preferred to rewriting colours in someone's document.
export const NODE_GRAY = { fill: '#F3F3F3', border: '#C7C7C7', ink: '#171717' }

// Every swatch value as a flat lookup, so a stored node colour can be matched
// back to its family/shade for the grid's selected-ring.
export function allSwatches() {
  return ESPRESSO_FAMILIES.flatMap((family) => family.shades)
}

// Readable text ink for a given fill (reuses the canvas ink heuristic). Kept here
// so node creation asks ONE module for "fill X -> use ink Y".
export function inkFor(fillHex) {
  return readableInk(fillHex)
}

// --- matching a stored colour to the grid (#495) ------------------------------
//
// Diagrams made before the palettes were unified hold values from the older
// SWATCH_PALETTE, which are genuinely different colours — its red is #E24C4C
// against Espresso's #E03636. Matched by string those shapes select nothing, so the
// picker opens looking unset on a shape that plainly has a colour.
//
// So the grid rings the NEAREST swatch instead. Nothing on the canvas changes: the
// stored value is left exactly as it is and only rewritten if the user picks
// something. The ring says "closest to this", which is true, rather than "none of
// these", which is not.
//
// Distance is measured in CIE Lab, not in RGB. RGB distance is not merely
// imprecise here, it is wrong: it puts the old palette's mint green (#88D5A5) in
// the TEAL family and its soft red (#F08A8A) in PINK, because a large blue-channel
// difference outweighs the hue. Both have tests. Lab is ~20 lines and gets the
// family right, which is the whole job — someone reading the grid checks the row
// before the shade.
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function parseHex(value) {
  const match = HEX.exec(String(value || '').trim())
  if (!match) return null
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16))
}

// sRGB -> CIE Lab (D65). The two steps that matter: undo the sRGB transfer curve so
// the channels are linear light, then the cube-root compression that makes Lab's
// axes roughly uniform to the eye.
const WHITE_POINT = [0.95047, 1, 1.08883]

function toLinear(channel) {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function pivot(value) {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
}

function toLab([r, g, b]) {
  const [red, green, blue] = [toLinear(r), toLinear(g), toLinear(b)]
  const xyz = [
    red * 0.4124 + green * 0.3576 + blue * 0.1805,
    red * 0.2126 + green * 0.7152 + blue * 0.0722,
    red * 0.0193 + green * 0.1192 + blue * 0.9505,
  ].map((value, axis) => pivot(value / WHITE_POINT[axis]))
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])]
}

function distance(a, b) {
  const [first, second] = [toLab(a), toLab(b)]
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2
}

// The swatch a stored colour should show as selected, or null when the value is not
// a colour at all ('none', 'transparent', a malformed hex). An exact match wins
// outright, so a colour already in the grid never depends on the metric.
export function nearestSwatch(value, candidates = [...allSwatches(), ...Object.values(NEUTRALS)]) {
  const target = parseHex(value)
  if (!target) return null
  const exact = candidates.find((hex) => hex.toLowerCase() === String(value).toLowerCase())
  if (exact) return exact
  let best = null
  for (const hex of candidates) {
    const rgb = parseHex(hex)
    if (!rgb) continue
    const away = distance(target, rgb)
    if (!best || away < best.away) best = { hex, away }
  }
  return best?.hex || null
}
