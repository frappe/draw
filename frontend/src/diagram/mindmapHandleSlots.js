// Where a node's gap "+" handles stand, measured against the branches themselves.
//
// A "+" marks the slot a new child would take, so it belongs in the whitespace
// BETWEEN two branches — never on one. Every branch leaves its parent from the
// same point and fans out to its own child, so how much room a slot actually has
// depends on the node, the number of children and how the layout spaced them. No
// fixed column can hold: with three children a column just in front of the child
// boxes is empty, and with nine the curve heading for a lower child runs straight
// through it.
//
// So the position is measured rather than assumed. Sample the real branch curves,
// scan the corridor between the parent and its child column, and take the point
// that keeps the most air from every curve, from the boxes, and from the handles
// already placed. A slot always gets a position — when the map is dense the best
// available one — because a "+" that hides itself is worse than one that is tight.

import { branchControlPoints } from './mindmapLayout.js'

// The mark is small and quiet; the TARGET around it is large (#427 items 1 and 7).
export const ADD_R = 7 // drawn "+" circle radius
export const ADD_OFFSET = 28 // gap from the node edge to a childless node's "+"
// Vertical breathing room for the two extreme gap handles: the "above the first
// child" "+" clears the top branch by this much, the "below the last child" one
// clears the bottom branch, so neither sits on the outermost curve.
export const GAP = 24
// How far a gap handle stands clear of the child column it slots into, so the mark
// has air on both sides rather than touching the box it precedes.
export const HANDLE_INSET = 20

// What "clear of" means in pixels: the drawn circle keeps this much empty space
// around it. Measured from the mark, not the hit target — the target may overlap a
// branch (it is invisible), the mark may not.
const BRANCH_CLEARANCE = ADD_R + 6
// A box is a softer neighbour than a branch: a "+" sitting in the 18px gap between
// two sibling boxes reads as floating between them, where the same distance from a
// curve reads as sitting on it. So the box floor is the smaller of the two.
const BOX_CLEARANCE = ADD_R + 2
// Two "+" marks this close would read as one control, so a slot prefers any other
// position it can reach over crowding its neighbour.
const HANDLE_SEPARATION = ADD_R * 2 + 6

const COLUMNS = 8 // candidate x positions across the corridor, child column first
// Fallback positions INSIDE the child column, past the point where every branch has
// ended. The corridor between a parent and its children is only ~70px wide, so once
// a node has enough children the curves fill it and no x in it clears them all —
// but the vertical gaps between the child boxes themselves hold no branch at all.
const INSIDE_COLUMN = [ADD_R + 9, ADD_R + 20]
const SAMPLES = 24 // points per sampled branch curve

// --- curve geometry -----------------------------------------------------------

function edgeMid(box, right) {
  return { x: right ? box.x + box.w : box.x, y: box.y + box.h / 2 }
}

function cubicAt([p0, p1, p2, p3], t) {
  const u = 1 - t
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

// One branch as a polyline. It samples the exact cubic ConnectorView draws (both
// read branchControlPoints), so the clearance below is clearance from the curve on
// screen, not from a straight-line stand-in for it.
function branchPolyline(start, end) {
  const curve = branchControlPoints(start, end)
  return Array.from({ length: SAMPLES + 1 }, (_, i) => cubicAt(curve, i / SAMPLES))
}

export function branchPolylines(parentBox, childBoxes, side) {
  const right = side === 'right'
  const start = edgeMid(parentBox, right)
  return childBoxes.map((child) => branchPolyline(start, edgeMid(child, !right)))
}

// The branch's y where it crosses the vertical line at `x`. A branch is monotone in
// x (its control points sit on the midline), so one crossing exists inside its span;
// past either end the nearest end's y is the honest answer.
function branchYAt(points, x) {
  for (let i = 1; i < points.length; i += 1) {
    const [a, b] = [points[i - 1], points[i]]
    if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x)
    return a.y + (b.y - a.y) * t
  }
  const first = points[0]
  const last = points[points.length - 1]
  return Math.abs(x - first.x) < Math.abs(x - last.x) ? first.y : last.y
}

// --- distances ----------------------------------------------------------------

function segmentDistance(point, a, b) {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const lengthSquared = dx * dx + dy * dy
  const along = lengthSquared ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared : 0
  const t = Math.max(0, Math.min(1, along))
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t))
}

function polylineDistance(point, points) {
  let best = Infinity
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, segmentDistance(point, points[i - 1], points[i]))
  }
  return best
}

function boxDistance(point, box) {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w))
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h))
  return Math.hypot(dx, dy)
}

// --- placement ----------------------------------------------------------------

// Every x a gap handle may stand at, in preference order: across the corridor from
// the child column (the curves have reached their own children there, and it is
// where the new node will appear) back toward the parent edge, then — for a node
// with too many children for any of that to be clear — inside the child column
// itself, in the vertical gaps between the boxes, where no branch runs at all.
function candidateColumns(parentBox, side, childBoxes) {
  const right = side === 'right'
  const sign = right ? 1 : -1
  const near = right ? parentBox.x + parentBox.w + ADD_OFFSET : parentBox.x - ADD_OFFSET
  const edge = right
    ? Math.min(...childBoxes.map((child) => child.x))
    : Math.max(...childBoxes.map((child) => child.x + child.w))
  const inside = INSIDE_COLUMN.map((offset) => edge + sign * offset)
  const column = edge - sign * HANDLE_INSET
  if (right ? column <= near : column >= near) return [near, ...inside]
  const step = (column - near) / (COLUMNS - 1)
  return [...Array.from({ length: COLUMNS }, (_, i) => column - step * i), ...inside]
}

// The y a slot takes at one candidate column: between the two branches it sits
// between, or clear of the outermost one for the first and last slot. The middle
// slots are then held inside the gap between the two child boxes they sit between —
// two branches' midpoint is not the boxes' midpoint once the children have
// different heights (a multi-line label makes a tall node), and a "+" that follows
// the curves alone drifts into the taller neighbour's box.
function slotYAt(branchYs, index, childBoxes, insideColumn) {
  if (index === 0) return Math.min(branchYs[0], childBoxes[0].y) - GAP / 2
  if (index === branchYs.length) {
    const last = childBoxes[childBoxes.length - 1]
    return Math.max(branchYs[branchYs.length - 1], last.y + last.h) + GAP / 2
  }
  const y = (branchYs[index - 1] + branchYs[index]) / 2
  if (!insideColumn) return y
  return clampToGap(y, childBoxes[index - 1], childBoxes[index])
}

// Hold `y` inside the gap between two stacked boxes. A gap too tight to hold the
// mark has no room to give, so the mark is centred in it and the caller's clearance
// score decides whether that column is usable at all.
function clampToGap(y, above, below) {
  const [top, bottom] = [above.y + above.h + BOX_CLEARANCE, below.y - BOX_CLEARANCE]
  if (top > bottom) return (above.y + above.h + below.y) / 2
  return Math.min(Math.max(y, top), bottom)
}

// How good a candidate point is: its distance to the NEAREST branch, or 0 when it
// crowds a box or a handle already placed — those are disqualifying rather than
// merely tight, and scoring them 0 keeps one comparison for all three.
function scoreOf(point, { branches, boxes, placed }) {
  if (boxes.some((box) => boxDistance(point, box) < BOX_CLEARANCE)) return 0
  if (placed.some((other) => Math.hypot(point.x - other.cx, point.y - other.cy) < HANDLE_SEPARATION)) return 0
  return branches.reduce((best, points) => Math.min(best, polylineDistance(point, points)), Infinity)
}

// Every slot's point at one candidate column, top slot first. Which side of the
// child column the candidate is on decides what the slot is dodging: out in the
// corridor the branches are what is near, inside the column it is the boxes.
function slotsAtColumn(cx, childBoxes, context) {
  const branchYs = context.branches.map((points) => branchYAt(points, cx)).sort((a, b) => a - b)
  const inside = context.insideColumn(cx)
  return Array.from({ length: childBoxes.length + 1 }, (_, index) => ({
    cx,
    cy: slotYAt(branchYs, index, childBoxes, inside),
  }))
}

// A column works when EVERY one of its slots clears the branches, the boxes and its
// neighbouring handles. Whole columns are judged rather than single slots so one
// side's marks line up: handles scattered across three columns because each found
// its own roomiest pixel read as noise, not as a row of controls.
function columnClears(points, context) {
  return points.every((point, index) => {
    const placed = points.slice(0, index)
    return scoreOf({ x: point.cx, y: point.cy }, { ...context, placed }) >= BRANCH_CLEARANCE
  })
}

// The best position for one slot on its own, used only for a node so crowded that
// no whole column clears. A slot is never dropped — the roomiest spot it can reach
// is still the right answer, and it is what "find the nearest appropriate
// whitespace" means once the space runs out.
function placeSlot(index, columns, childBoxes, context) {
  let best = { cx: columns[0], cy: 0, score: -1 }
  for (const cx of columns) {
    const { cy } = slotsAtColumn(cx, childBoxes, context)[index]
    const score = scoreOf({ x: cx, y: cy }, context)
    if (score >= BRANCH_CLEARANCE) return { cx, cy }
    if (score > best.score) best = { cx, cy, score }
  }
  return { cx: best.cx, cy: best.cy }
}

// The N+1 gap-handle positions for one side, top slot first. `childBoxes` are that
// side's children sorted top→bottom; the returned points interleave with them
// (H,C,H,…,H), standing in the first column whose whole row of slots is clear of
// the branches — or, failing that, each in the roomiest spot it can reach.
export function gapHandlePoints(parentBox, side, childBoxes) {
  const right = side === 'right'
  const edge = right
    ? Math.min(...childBoxes.map((child) => child.x))
    : Math.max(...childBoxes.map((child) => child.x + child.w))
  const context = {
    branches: branchPolylines(parentBox, childBoxes, side),
    boxes: [parentBox, ...childBoxes],
    insideColumn: (cx) => (right ? cx > edge : cx < edge),
    placed: [],
  }
  const columns = candidateColumns(parentBox, side, childBoxes)
  for (const cx of columns) {
    const points = slotsAtColumn(cx, childBoxes, context)
    if (columnClears(points, context)) return points
  }
  for (let index = 0; index <= childBoxes.length; index += 1) {
    context.placed.push(placeSlot(index, columns, childBoxes, context))
  }
  return context.placed
}
