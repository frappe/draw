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

// A click on a node splits into two intents by where it lands (#123): the label
// interior EDITS the text (drops the caret straight in), while a rim within
// NODE_BORDER_ZONE canvas units of any bbox edge SELECTS the node. Keeping the
// border a select/grab zone lets the cursor say which a click will do — an
// I-beam over the label, an arrow over the rim.
export const NODE_BORDER_ZONE = 8

// Which of those intents a point at node-local (x, y) falls in, for a node of
// size box {w, h}. Returns 'edit' over the interior label area, 'select' on the
// rim (or anywhere outside the box). A node too small to hold an interior is all
// rim, so a tiny node never traps the caret in edit mode. Pure + browser-free so
// the zone logic unit-tests without a real pointer.
export function nodeClickZone(x, y, box, edge = NODE_BORDER_ZONE) {
  if (box.w <= edge * 2 || box.h <= edge * 2) return 'select'
  const inInterior = x >= edge && x <= box.w - edge && y >= edge && y <= box.h - edge
  return inInterior ? 'edit' : 'select'
}
