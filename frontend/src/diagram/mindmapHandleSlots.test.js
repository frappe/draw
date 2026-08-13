import { describe, it, expect } from 'vitest'
import { gapHandlePoints, branchPolylines, ADD_R } from './mindmapHandleSlots.js'

// A "+" must never sit on a branch. The clearance is measured from the DRAWN mark,
// so a handle is acceptable while its circle keeps clear air around it.
const MIN_AIR = ADD_R + 4

// Distance from a point to a sampled branch, computed here rather than imported, so
// the assertions do not grade the placement with its own ruler.
function distanceToBranch(point, points) {
  let best = Infinity
  for (let i = 1; i < points.length; i += 1) {
    const [a, b] = [points[i - 1], points[i]]
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const lengthSquared = dx * dx + dy * dy
    const along = lengthSquared ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared : 0
    const t = Math.max(0, Math.min(1, along))
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)))
  }
  return best
}

function clearanceOf(point, parentBox, childBoxes, side) {
  return branchPolylines(parentBox, childBoxes, side).reduce(
    (best, points) => Math.min(best, distanceToBranch({ x: point.cx, y: point.cy }, points)),
    Infinity,
  )
}

// Children as the tidy layout leaves them: one column, evenly spaced, centred on
// the parent. `count` drives how tightly the branches pack together.
function fanOut(count, { side = 'right', gap = 26, w = 140, h = 40 } = {}) {
  const parentBox = { x: 0, y: 0, w: 140, h: 40 }
  const pitch = h + gap
  const top = parentBox.y + parentBox.h / 2 - (count * pitch - gap) / 2
  const childBoxes = Array.from({ length: count }, (_, i) => ({
    x: side === 'right' ? 210 : -210 - w,
    y: top + i * pitch,
    w,
    h,
  }))
  return { parentBox, childBoxes, side }
}

describe('gapHandlePoints', () => {
  it('offers one slot above the first child, one below the last, and one per gap', () => {
    const { parentBox, childBoxes, side } = fanOut(4)
    const points = gapHandlePoints(parentBox, side, childBoxes)
    expect(points).toHaveLength(5)
    const ys = points.map((point) => point.cy)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
  })

  // The bug this module exists for: with enough children the branches pack close
  // together, and a fixed column drops the middle "+" marks straight onto the curves
  // heading for the lower children.
  it('keeps every handle clear of every branch, however many children there are', () => {
    for (const count of [2, 3, 5, 8, 12]) {
      const { parentBox, childBoxes, side } = fanOut(count)
      for (const point of gapHandlePoints(parentBox, side, childBoxes)) {
        expect(clearanceOf(point, parentBox, childBoxes, side)).toBeGreaterThanOrEqual(MIN_AIR)
      }
    }
  })

  it('keeps them clear on the left side too', () => {
    const { parentBox, childBoxes, side } = fanOut(8, { side: 'left' })
    for (const point of gapHandlePoints(parentBox, side, childBoxes)) {
      expect(clearanceOf(point, parentBox, childBoxes, side)).toBeGreaterThanOrEqual(MIN_AIR)
      expect(point.cx).toBeLessThan(parentBox.x)
    }
  })

  it('never lands on the parent or on a child box', () => {
    const { parentBox, childBoxes, side } = fanOut(6)
    const inside = (point, box) =>
      point.cx >= box.x && point.cx <= box.x + box.w && point.cy >= box.y && point.cy <= box.y + box.h
    for (const point of gapHandlePoints(parentBox, side, childBoxes)) {
      for (const box of [parentBox, ...childBoxes]) expect(inside(point, box)).toBe(false)
    }
  })

  it('keeps two handles far enough apart to read as two controls', () => {
    const { parentBox, childBoxes, side } = fanOut(9)
    const points = gapHandlePoints(parentBox, side, childBoxes)
    for (let i = 1; i < points.length; i += 1) {
      const [a, b] = [points[i - 1], points[i]]
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(ADD_R * 2)
    }
  })

  // Children of different heights (a two-line label makes a tall node) put the
  // midpoint of two branches inside the taller neighbour's box, which is how a "+"
  // used to end up sitting on a node instead of between two.
  it('stays in the whitespace when the children have different heights', () => {
    const parentBox = { x: 0, y: 0, w: 140, h: 40 }
    let y = -140
    const childBoxes = [40, 80, 40, 120, 40, 60].map((h) => {
      const box = { x: 210, y, w: 140, h }
      y += h + 26
      return box
    })
    for (const point of gapHandlePoints(parentBox, 'right', childBoxes)) {
      expect(clearanceOf(point, parentBox, childBoxes, 'right')).toBeGreaterThanOrEqual(MIN_AIR)
      for (const box of [parentBox, ...childBoxes]) {
        const insideX = point.cx >= box.x && point.cx <= box.x + box.w
        const insideY = point.cy >= box.y && point.cy <= box.y + box.h
        expect(insideX && insideY).toBe(false)
      }
    }
  })

  // Whitespace, not a hiding place: a slot always comes back with a position, even
  // when the children are packed tighter than the marks would like.
  it('places every slot even when the children are packed tight', () => {
    const { parentBox, childBoxes, side } = fanOut(10, { gap: 4, h: 28 })
    const points = gapHandlePoints(parentBox, side, childBoxes)
    expect(points).toHaveLength(11)
    for (const point of points) {
      expect(Number.isFinite(point.cx)).toBe(true)
      expect(Number.isFinite(point.cy)).toBe(true)
    }
  })
})
