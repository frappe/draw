import { describe, it, expect } from 'vitest'
import { pruneTrail, trailOutline, trailOpacity, LASER_FADE_MS, LASER_WIDTH } from './laser.js'

// The laser trail is the one whiteboard element that is pure chrome: it fades on
// its own and never reaches the document (spec C5/C10). These cover the rules the
// render layer depends on — expiry, the taper along the tail, and the single
// continuous outline that replaced the per-segment beads (#450).

const trail = (now) => [
  { x: 0, y: 0, at: now - LASER_FADE_MS - 1 }, // expired
  { x: 10, y: 0, at: now - LASER_FADE_MS / 2 },
  { x: 20, y: 0, at: now },
]

// The outline runs down one side and back up the other, so side A is the first
// half and side B is the second half reversed — index i on both sides describes
// the same point of the spine.
function widthAt(outline, index) {
  const left = outline[index]
  const right = outline[outline.length - 1 - index]
  return Math.hypot(left.x - right.x, left.y - right.y)
}

describe('pruneTrail', () => {
  it('drops points older than the fade window and keeps the rest', () => {
    const now = 10_000
    expect(pruneTrail(trail(now), now).map((point) => point.x)).toEqual([10, 20])
  })

  it('empties the trail once the pointer has been still for the fade window', () => {
    const now = 10_000
    const points = [{ x: 5, y: 5, at: now }]
    expect(pruneTrail(points, now + LASER_FADE_MS)).toEqual([])
  })
})

describe('trailOutline', () => {
  it('returns one closed outline with a point per side of the spine', () => {
    const now = 10_000
    const outline = trailOutline(trail(now), now)

    expect(outline.length).toBeGreaterThan(3)
    expect(outline.length % 2).toBe(0)
  })

  it('tapers from a thin tail to the full width at the head', () => {
    const now = 10_000
    const outline = trailOutline(
      [
        { x: 0, y: 0, at: now - LASER_FADE_MS * 0.5 },
        { x: 40, y: 0, at: now - LASER_FADE_MS * 0.25 },
        { x: 80, y: 0, at: now },
      ],
      now,
    )

    const tail = widthAt(outline, 0)
    const head = widthAt(outline, outline.length / 2 - 1)
    expect(tail).toBeGreaterThan(0)
    expect(tail).toBeLessThan(head)
    expect(head).toBeCloseTo(LASER_WIDTH, 5)
  })

  it('fills a fast flick with interpolated points so the ribbon cannot facet', () => {
    // Two points 300 units apart is what a fast drag reports. The outline has to
    // carry many more than two spine points, or the taper steps in one jump —
    // the artifact #450 is about.
    const now = 10_000
    const outline = trailOutline(
      [
        { x: 0, y: 0, at: now - 100 },
        { x: 300, y: 0, at: now },
      ],
      now,
    )

    expect(outline.length / 2).toBeGreaterThan(20)
  })

  it('bounds the point count however far the pointer flew', () => {
    // The outline is rebuilt every animation frame. A flick across a zoomed-out
    // canvas covers thousands of canvas units, and at a fixed spacing that would
    // be thousands of points per frame — the spacing has to open up instead.
    const now = 10_000
    const points = [
      { x: 0, y: 0, at: now - 100 },
      { x: 250_000, y: 0, at: now },
    ]

    expect(trailOutline(points, now).length / 2).toBeLessThanOrEqual(401)
  })

  it('keeps every added point on the line the pointer travelled', () => {
    // Resampling interpolates, it does not re-aim: a straight drag must stay
    // straight, so the spine of a horizontal flick sits on y = 0.
    const now = 10_000
    const outline = trailOutline(
      [
        { x: 0, y: 0, at: now - 100 },
        { x: 120, y: 0, at: now },
      ],
      now,
    )

    const half = outline.length / 2
    for (let i = 0; i < half; i += 1) {
      const midpointY = (outline[i].y + outline[outline.length - 1 - i].y) / 2
      expect(midpointY).toBeCloseTo(0, 5)
    }
  })

  it('drops expired points instead of anchoring the tail at a stale position', () => {
    const now = 10_000
    const points = [
      { x: 0, y: 0, at: now - LASER_FADE_MS * 2 }, // expired
      { x: 500, y: 0, at: now - LASER_FADE_MS }, // expired
      { x: 20, y: 0, at: now },
      { x: 30, y: 0, at: now },
    ]
    const xs = trailOutline(points, now).map((point) => point.x)

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...xs)).toBeLessThanOrEqual(30)
  })

  it('has no outline once every point has expired', () => {
    const now = 10_000
    const points = [
      { x: 0, y: 0, at: now - LASER_FADE_MS * 2 },
      { x: 10, y: 0, at: now - LASER_FADE_MS },
    ]
    expect(trailOutline(points, now)).toEqual([])
  })

  it('has no outline for a single point, leaving only the head dot', () => {
    expect(trailOutline([{ x: 1, y: 1, at: 0 }], 0)).toEqual([])
  })

  it('survives two identical points, which have no direction to offset along', () => {
    const now = 10_000
    const points = [
      { x: 7, y: 7, at: now },
      { x: 7, y: 7, at: now },
    ]
    expect(() => trailOutline(points, now)).not.toThrow()
  })
})

describe('trailOpacity', () => {
  it('is full at the moment the newest point lands and zero once it expires', () => {
    const now = 10_000
    const points = [{ x: 0, y: 0, at: now }]

    expect(trailOpacity(points, now)).toBe(1)
    expect(trailOpacity(points, now + LASER_FADE_MS)).toBe(0)
    expect(trailOpacity(points, now + LASER_FADE_MS / 2)).toBeCloseTo(0.5, 5)
  })

  it('is zero for an empty trail', () => {
    expect(trailOpacity([], 0)).toBe(0)
  })
})
