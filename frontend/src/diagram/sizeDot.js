// The size-preview dot for a pen/highlighter/eraser width picker (#498, revised):
// SCALED across the row's own range rather than clamped to it.
//
// It used to be `Math.min(size, 18)`, which collapsed the highlighter's 18 and 26
// into the same 18px dot — two options drawn identically, told apart only by the
// selected background — and drew the pen's 2 as a 2px speck. The clamp existed for
// a real reason (a 26px dot does not fit a 28px cell), but capping the top instead
// of mapping the range is what made two sizes one control twice.
//
// Position is by INDEX in the row, not by the size's own value: the pen row's
// widths (2, 4, 8) are not evenly spaced, so an earlier pass that scaled by value
// put the middle dot only a third of the way up (barely bigger than small, a big
// jump to large) — three unevenly-stepped dots reading as two. Every row here has
// exactly three options, so three evenly-stepped diameters read as small/medium/
// large regardless of how the underlying widths happen to be spaced.
export const DOT_MIN = 4
export const DOT_MAX = 18

export function dotDiameter(size, sizes) {
  const index = sizes.indexOf(size)
  const position = sizes.length > 1 ? index / (sizes.length - 1) : 1
  return Math.round(DOT_MIN + position * (DOT_MAX - DOT_MIN))
}

export function dotStyle(size, sizes) {
  const dot = dotDiameter(size, sizes)
  return { width: `${dot}px`, height: `${dot}px` }
}
