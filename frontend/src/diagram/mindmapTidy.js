// Vertical packing for the mind-map layout: where each node sits relative to its
// own parent (#427).
//
// The old rule gave every subtree a BAND as tall as everything under it and put
// the node in the middle of that band. It never overlapped, but it spent height it
// did not need: a branch with three children reserved three children's worth of
// room in its own column, so the gap from it to the next branch was four times the
// gap between two plain ones. Nodes at the same level looked randomly spaced.
//
// This packs by CONTOUR instead. A subtree reports how far it reaches up and down
// at each depth, and a sibling only has to clear the depths they actually share.
// Two leaves sit exactly V_GAP apart however bushy their neighbours are, and a
// subtree pushes its sibling only where its own descendants would really collide.
//
// Everything here is relative: a subtree is laid out around its own root at 0, and
// the caller shifts the whole thing into place. Pure and DOM-free.

// A contour is depth → { top, bottom }, both relative to the subtree root's centre.
function mergeContour(into, from, shift) {
  for (const [depth, span] of from) {
    const moved = { top: span.top + shift, bottom: span.bottom + shift }
    const existing = into.get(depth)
    if (!existing) into.set(depth, moved)
    else into.set(depth, { top: Math.min(existing.top, moved.top), bottom: Math.max(existing.bottom, moved.bottom) })
  }
}

// How far `next` must move down to clear `placed` at every depth they share.
function clearance(placed, next, gap) {
  let shift = 0
  for (const [depth, span] of next) {
    const above = placed.get(depth)
    if (!above) continue
    shift = Math.max(shift, above.bottom + gap - span.top)
  }
  return shift
}

// Lay out one subtree around its own root, which sits at 0.
// Returns { offsets: Map id → dy, contour: Map depth → {top, bottom} }.
export function tidySubtree(node, { sizeOf, childrenOf, gap, depth = 0 }) {
  const size = sizeOf(node)
  const offsets = new Map([[node.id, 0]])
  const contour = new Map([[depth, { top: -size.h / 2, bottom: size.h / 2 }]])

  const children = childrenOf(node)
  if (!children.length) return { offsets, contour }

  // Stack the children, each clearing the ones already placed.
  const placed = new Map()
  const laid = []
  for (const child of children) {
    const sub = tidySubtree(child, { sizeOf, childrenOf, gap, depth: depth + 1 })
    const shift = laid.length ? clearance(placed, sub.contour, gap) : 0
    mergeContour(placed, sub.contour, shift)
    laid.push({ sub, shift })
  }

  // The parent sits level with the middle of its children, so a branch reads as
  // centred on what hangs off it rather than on the room its subtree reserved.
  const first = laid[0].shift
  const last = laid[laid.length - 1].shift
  const centre = (first + last) / 2
  for (const { sub, shift } of laid) {
    for (const [id, dy] of sub.offsets) offsets.set(id, dy + shift - centre)
    mergeContour(contour, sub.contour, shift - centre)
  }
  return { offsets, contour }
}

// Pack a list of sibling subtrees against each other and return each one's dy,
// with the whole group centred on 0 — the shape a side of the root needs.
export function tidyGroup(subtrees, gap) {
  if (!subtrees.length) return []
  const placed = new Map()
  const shifts = []
  for (const sub of subtrees) {
    const shift = shifts.length ? clearance(placed, sub.contour, gap) : 0
    mergeContour(placed, sub.contour, shift)
    shifts.push(shift)
  }
  const span = placed.get(Math.min(...placed.keys()))
  const centre = (span.top + span.bottom) / 2
  return shifts.map((shift) => shift - centre)
}
