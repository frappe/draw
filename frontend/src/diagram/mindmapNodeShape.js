// Corner radius for a mind-map node's <rect> body. Kept as a pure helper (like
// the color/layout helpers) so the node shape geometry stays unit-testable and
// browser-free.
//
// The default "pill" radius is h/2, which turns a *tall* node (multi-line or
// expanded) into an oval/stadium. Cap it so a grown node reads as a rounded
// rectangle, while short nodes still keep h/2 and look softly rounded — issue
// #124. The cap value is a visual taste call.
export function nodeRx(node, b) {
  if (node.shape === 'rounded') return 12
  if (node.shape === 'rectangle') return 4
  return Math.min(b.h / 2, 12) // pill (default), capped so tall nodes aren't oval (#124)
}
