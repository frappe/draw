// Freely-drawn closed polygon (issue #139) — pure geometry, no Vue, so it stays
// unit-testable (CONVENTIONS). The draw gesture collects raw canvas-unit vertices;
// buildPolygonShape() converts them to the stored shape on commit.
//
// STORAGE CONVENTION: a polygon stores its vertices NORMALISED to its bounding box
// (each component 0..1), exactly like the fixed presets below. Because the render
// scales those normals back onto x/y/w/h, move (x/y), resize (w/h) and rotation all
// flow through the shared shape machinery with no special-casing — a polygon
// behaves like any other block shape.
//
// The presets used to live in ShapeView, so only the canvas could draw them: the
// export/thumbnail path had no branch for pentagon, hexagon, arrow or star and fell
// through to a <rect>, which is why all four exported as plain rectangles (#468).
// They live here now so one geometry feeds the canvas, PNG/PDF export, the saved
// thumbnail, the home tiles and the minimap.

import { SKEW_RATIO } from './flowchartShapes.js'
import { arrowOutline } from './blockArrow.js'

// A closed polygon needs at least a triangle.
export const MIN_POLYGON_VERTICES = 3

// Most sides a custom polygon may be given (#451). Past this the outline is not
// tellable from a circle at the sizes shapes are drawn at, so the extra vertices
// only cost file size.
export const MAX_POLYGON_SIDES = 15
// The default width a custom polygon is inserted at, in canvas units.
export const POLYGON_INSERT_WIDTH = 160

// Preset block shapes whose outline is fixed, normalised to the box like a stored
// polygon's own points. `star` is generated rather than tabulated, so ask
// isPresetPolygon() rather than reading this table to decide what a type is.
// How far the top edge of a trapezoid is inset at each end. 0.2 leaves the top
// three-fifths of the base, which reads as a trapezoid rather than as a triangle
// with its tip cut off.
const TRAPEZOID_INSET = 0.2

// An entry is either a fixed table of normalised points, or a function of the shape
// for the two that are not fixed — the star is generated, and the arrow's
// proportions are adjustable per shape (#469). Everything reads them through
// presetPolygonPoints, so neither is a special case at the call site.
export const PRESET_POLYGONS = {
  pentagon: [[0.5, 0], [1, 0.38], [0.82, 1], [0.18, 1], [0, 0.38]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  arrow: arrowOutline,
  star: starOutline,
  // Narrow side up, the usual convention (#470).
  trapezoid: [[TRAPEZOID_INSET, 0], [1 - TRAPEZOID_INSET, 0], [1, 1], [0, 1]],
  // The slant is the flowchart Input/Output node's, read from its own constant so
  // the two cannot drift apart. Only the RATIO carries over: that node also caps
  // the skew at 18px, which keeps a very wide node from shearing into a slash, but
  // a block shape is resized by hand and should hold its proportions as it grows.
  parallelogram: [[SKEW_RATIO, 0], [1, 0], [1 - SKEW_RATIO, 1], [0, 1]],
}

// Five points, and an inner radius 0.2 of the box against an outer 0.5.
const STAR_ARMS = 5
const STAR_INNER_RATIO = 0.2

// Consecutive vertices closer than this (canvas units) collapse to one, so a
// double-click's near-identical second press never leaves a zero-length edge.
const DEDUPE_EPSILON = 1

// Build the stored shape partial from raw canvas-unit vertices, or null when there
// are fewer than three distinct ones. Points are normalised to the extent; w/h are
// the extent itself (floored at 1 so an axis-aligned degenerate polygon never
// divides by zero). `epsilon` tunes the consecutive-duplicate merge for the caller's
// zoom.
export function buildPolygonShape(rawPoints, epsilon = DEDUPE_EPSILON) {
  const points = dedupeConsecutive(rawPoints || [], epsilon)
  if (points.length < MIN_POLYGON_VERTICES) return null
  const bbox = polygonBBox(points)
  const normals = points.map((p) => ({ x: (p.x - bbox.x) / bbox.w, y: (p.y - bbox.y) / bbox.h }))
  return { type: 'polygon', x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, points: normals }
}

// An equiangular polygon with `sides` equal sides (#451), as the stored `points`
// plus the `aspect` (width / height) of its true outline.
//
// The caller MUST size the box to that aspect. Points are normalised to their own
// bounding box, exactly like a hand-drawn polygon, and the renderer scales them
// back onto w/h — so a pentagon dropped into a square box would be stretched and
// its sides would no longer be equal. Sizing to the aspect is what keeps the
// promise the tile makes.
//
// The first vertex points straight up, so three sides read as a triangle standing
// on its base and five as a textbook pentagon.
export function regularPolygon(sides) {
  const count = clampPolygonSides(sides)
  // Radius 100 rather than 1: polygonBBox floors its w/h at 1 canvas unit, which
  // would distort the normalisation of a unit-sized outline.
  const vertices = []
  for (let i = 0; i < count; i += 1) {
    const angle = ((-90 + (360 / count) * i) * Math.PI) / 180
    vertices.push({ x: 100 * Math.cos(angle), y: 100 * Math.sin(angle) })
  }
  const box = polygonBBox(vertices)
  return {
    points: vertices.map((p) => ({ x: (p.x - box.x) / box.w, y: (p.y - box.y) / box.h })),
    aspect: box.w / box.h,
  }
}

// A side count the polygon builder can use: a whole number, at least a triangle,
// no more than MAX_POLYGON_SIDES. The count reaches this from a text input, so
// anything unreadable falls back to the smallest polygon rather than throwing.
export function clampPolygonSides(sides) {
  const count = Math.round(Number(sides))
  if (!Number.isFinite(count)) return MIN_POLYGON_VERTICES
  return Math.min(Math.max(count, MIN_POLYGON_VERTICES), MAX_POLYGON_SIDES)
}

// Whether a typed side count is one the user is allowed to submit. Separate from
// clampPolygonSides on purpose: the input disables its button on a bad value
// instead of silently accepting a different polygon than the one asked for.
export function isValidPolygonSides(sides) {
  const count = Number(sides)
  return Number.isInteger(count) && count >= MIN_POLYGON_VERTICES && count <= MAX_POLYGON_SIDES
}

// Absolute SVG points string ("x,y x,y …") for a stored polygon — its normalised
// points scaled back onto the current x/y/w/h box. Shared by ShapeView, the
// export/thumbnail builder and the palette glyph so all three agree. Empty when the
// shape carries no points. Every component is coerced to a finite number: the
// export interpolates this straight into markup for a possibly-shared document, so
// a crafted point must never escape the attribute (it collapses to 0 instead).
export function polygonPointsString(shape) {
  const points = shape.points || []
  if (!points.length) return ''
  const x = num(shape.x)
  const y = num(shape.y)
  const w = num(shape.w)
  const h = num(shape.h)
  return points.map((p) => `${x + num(p.x) * w},${y + num(p.y) * h}`).join(' ')
}

// Whether a shape type draws as one of the preset outlines. Every renderer asks
// this rather than listing the types, so adding a preset reaches all of them.
export function isPresetPolygon(type) {
  return Boolean(PRESET_POLYGONS[type])
}

// Absolute SVG points string for a preset shape, or '' when the type has none.
// Coerces the box the same way polygonPointsString does: the export interpolates
// the result straight into markup for a possibly-shared document.
export function presetPolygonPoints(shape) {
  const outline = PRESET_POLYGONS[shape?.type]
  if (!outline) return ''
  const points = typeof outline === 'function' ? outline(shape) : outline
  const x = num(shape?.x)
  const y = num(shape?.y)
  const w = num(shape?.w)
  const h = num(shape?.h)
  return points.map(([nx, ny]) => `${x + num(nx) * w},${y + num(ny) * h}`).join(' ')
}

// Alternating outer and inner vertices around the box centre, normalised.
function starOutline() {
  const points = []
  for (let i = 0; i < STAR_ARMS * 2; i += 1) {
    const angle = ((-90 + i * (180 / STAR_ARMS)) * Math.PI) / 180
    const radius = i % 2 ? STAR_INNER_RATIO : 0.5
    points.push([0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)])
  }
  return points
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Whether `point` lies within `radius` (canvas units) of the first vertex — the
// snap-to-first close test.
export function isNearFirstVertex(point, first, radius) {
  if (!point || !first) return false
  return Math.hypot(point.x - first.x, point.y - first.y) <= radius
}

// Whether the in-progress vertices could form a closed polygon (>= 3 distinct).
export function canClosePolygon(rawPoints, epsilon = DEDUPE_EPSILON) {
  return dedupeConsecutive(rawPoints || [], epsilon).length >= MIN_POLYGON_VERTICES
}

// Axis-aligned extent of raw vertices as {x,y,w,h}. w/h are floored at 1 so a
// polygon collapsed onto one axis stays a valid (thin) box rather than a zero
// divisor. An empty list yields a zero box at the origin.
export function polygonBBox(points) {
  if (!points || !points.length) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) }
}

// Drop any vertex within `epsilon` of the one before it, so accidental double taps
// (and a double-click's duplicate second press) never create degenerate edges.
function dedupeConsecutive(points, epsilon) {
  const out = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) <= epsilon) continue
    out.push(p)
  }
  return out
}
