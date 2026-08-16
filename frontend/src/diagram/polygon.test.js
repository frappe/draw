import { describe, it, expect } from 'vitest'
import {
  buildPolygonShape,
  polygonPointsString,
  polygonBBox,
  isNearFirstVertex,
  canClosePolygon,
  regularPolygon,
  clampPolygonSides,
  isValidPolygonSides,
  MAX_POLYGON_SIDES,
  MIN_POLYGON_VERTICES,
  isPresetPolygon,
  presetPolygonPoints,
  PRESET_POLYGONS,
} from './polygon.js'
import { SKEW_RATIO } from './flowchartShapes.js'

// A right triangle whose extent is a neat 100x80 box at (10,20), so the normalised
// values are exact fractions.
const TRIANGLE = [
  { x: 10, y: 20 },
  { x: 110, y: 20 },
  { x: 10, y: 100 },
]

describe('polygonBBox', () => {
  it('derives the axis-aligned extent from raw vertices', () => {
    expect(polygonBBox(TRIANGLE)).toEqual({ x: 10, y: 20, w: 100, h: 80 })
  })

  it('floors a collapsed axis at 1 so a vertical polygon never divides by zero', () => {
    const vertical = [{ x: 5, y: 0 }, { x: 5, y: 40 }, { x: 5, y: 80 }]
    expect(polygonBBox(vertical)).toEqual({ x: 5, y: 0, w: 1, h: 80 })
  })

  it('returns a zero box at the origin for no points', () => {
    expect(polygonBBox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})

describe('buildPolygonShape', () => {
  it('stores type, the extent box, and points normalised to it', () => {
    const shape = buildPolygonShape(TRIANGLE)
    expect(shape).toMatchObject({ type: 'polygon', x: 10, y: 20, w: 100, h: 80 })
    // (10,20)->(0,0), (110,20)->(1,0), (10,100)->(0,1).
    expect(shape.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ])
  })

  it('round-trips: normalised points scale back to the exact drawn coordinates', () => {
    const shape = buildPolygonShape(TRIANGLE)
    expect(polygonPointsString(shape)).toBe('10,20 110,20 10,100')
  })

  it('rejects fewer than three vertices (nothing to close)', () => {
    expect(buildPolygonShape([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBeNull()
    expect(MIN_POLYGON_VERTICES).toBe(3)
  })

  it('drops a near-duplicate trailing vertex (a double-click closes cleanly)', () => {
    // A double-click's second press lands on ~the same spot as the third vertex, so
    // the raw list has four points but only three distinct ones.
    const withDup = [...TRIANGLE, { x: 10.4, y: 100.3 }]
    const shape = buildPolygonShape(withDup, 1)
    expect(shape.points).toHaveLength(3)
  })

  it('still rejects when de-duplication drops the list below three', () => {
    const collapsed = [{ x: 0, y: 0 }, { x: 0.2, y: 0.1 }, { x: 0.1, y: 0.2 }]
    expect(buildPolygonShape(collapsed, 1)).toBeNull()
  })
})

describe('polygonPointsString', () => {
  it('scales normalised points onto the shape box', () => {
    const shape = { x: 0, y: 0, w: 200, h: 100, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] }
    expect(polygonPointsString(shape)).toBe('0,0 100,100 200,0')
  })

  it('follows the box after a move (x/y shift every point)', () => {
    const shape = { x: 50, y: 30, w: 200, h: 100, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] }
    expect(polygonPointsString(shape)).toBe('50,30 150,130 250,30')
  })

  it('follows the box after a resize (w/h scale every point)', () => {
    const shape = { x: 0, y: 0, w: 400, h: 200, points: [{ x: 0, y: 0 }, { x: 0.5, y: 1 }, { x: 1, y: 0 }] }
    expect(polygonPointsString(shape)).toBe('0,0 200,200 400,0')
  })

  it('is empty when the shape carries no points', () => {
    expect(polygonPointsString({ x: 0, y: 0, w: 10, h: 10, points: [] })).toBe('')
    expect(polygonPointsString({ x: 0, y: 0, w: 10, h: 10 })).toBe('')
  })
})

describe('isNearFirstVertex (snap-to-close)', () => {
  const first = { x: 100, y: 100 }

  it('is true within the radius', () => {
    expect(isNearFirstVertex({ x: 106, y: 108 }, first, 10)).toBe(true) // dist 10
  })

  it('is false outside the radius', () => {
    expect(isNearFirstVertex({ x: 120, y: 100 }, first, 10)).toBe(false) // dist 20
  })

  it('is false without a point or first vertex', () => {
    expect(isNearFirstVertex(null, first, 10)).toBe(false)
    expect(isNearFirstVertex({ x: 0, y: 0 }, null, 10)).toBe(false)
  })
})

describe('canClosePolygon', () => {
  it('needs at least three distinct vertices', () => {
    expect(canClosePolygon(TRIANGLE)).toBe(true)
    expect(canClosePolygon(TRIANGLE.slice(0, 2))).toBe(false)
  })

  it('counts distinct vertices, not near-duplicates', () => {
    const twoDistinct = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50.2, y: 0.1 }]
    expect(canClosePolygon(twoDistinct, 1)).toBe(false)
  })
})

// #451 item 2: the custom polygon. The promise the tile makes is "equal sides", so
// that is what these check — including the aspect the caller must size the box to,
// which is the whole reason the promise can be kept.
describe('regularPolygon', () => {
  // Side lengths of the outline once its normalised points are scaled onto a box
  // of the polygon's own aspect.
  function sideLengths({ points, aspect }, height = 100) {
    const width = height * aspect
    const scaled = points.map((p) => ({ x: p.x * width, y: p.y * height }))
    return scaled.map((point, index) => {
      const next = scaled[(index + 1) % scaled.length]
      return Math.hypot(next.x - point.x, next.y - point.y)
    })
  }

  it('has one vertex per side', () => {
    expect(regularPolygon(3).points).toHaveLength(3)
    expect(regularPolygon(7).points).toHaveLength(7)
    expect(regularPolygon(MAX_POLYGON_SIDES).points).toHaveLength(MAX_POLYGON_SIDES)
  })

  it('gives every side the same length, at its own aspect', () => {
    for (const sides of [3, 5, 8, 12, 15]) {
      const lengths = sideLengths(regularPolygon(sides))
      const longest = Math.max(...lengths)
      const shortest = Math.min(...lengths)
      expect(longest - shortest).toBeLessThan(0.01)
    }
  })

  it('normalises the points to its own bounding box', () => {
    const { points } = regularPolygon(6)
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(0, 6)
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0, 6)
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(1, 6)
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(1, 6)
  })

  it('stands the first vertex at the top', () => {
    const [first] = regularPolygon(5).points
    expect(first.y).toBeCloseTo(0, 6)
    expect(first.x).toBeCloseTo(0.5, 6)
  })

  it('reports a square aspect for a square and a wide one for a triangle', () => {
    expect(regularPolygon(4).aspect).toBeCloseTo(1, 6)
    // A triangle standing on its base is wider than it is tall.
    expect(regularPolygon(3).aspect).toBeGreaterThan(1)
  })

  it('builds a shape the renderer can draw at any count in range', () => {
    for (let sides = MIN_POLYGON_VERTICES; sides <= MAX_POLYGON_SIDES; sides += 1) {
      const { points, aspect } = regularPolygon(sides)
      expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      expect(Number.isFinite(aspect) && aspect > 0).toBe(true)
    }
  })
})

describe('clampPolygonSides', () => {
  it('keeps a count inside the supported range', () => {
    expect(clampPolygonSides(5)).toBe(5)
    expect(clampPolygonSides(2)).toBe(MIN_POLYGON_VERTICES)
    expect(clampPolygonSides(99)).toBe(MAX_POLYGON_SIDES)
  })

  it('rounds a fraction and falls back on nonsense', () => {
    expect(clampPolygonSides(6.4)).toBe(6)
    expect(clampPolygonSides('abc')).toBe(MIN_POLYGON_VERTICES)
    expect(clampPolygonSides(undefined)).toBe(MIN_POLYGON_VERTICES)
  })
})

describe('isValidPolygonSides', () => {
  it('accepts only whole counts a polygon can be built from', () => {
    expect(isValidPolygonSides(3)).toBe(true)
    expect(isValidPolygonSides(15)).toBe(true)
    expect(isValidPolygonSides('8')).toBe(true)
  })

  // The input rejects rather than corrects: asking for 30 sides and silently
  // getting 15 is worse than being told 15 is the limit.
  it('rejects out-of-range, fractional and empty input', () => {
    expect(isValidPolygonSides(2)).toBe(false)
    expect(isValidPolygonSides(16)).toBe(false)
    expect(isValidPolygonSides(5.5)).toBe(false)
    expect(isValidPolygonSides('')).toBe(false)
    expect(isValidPolygonSides('abc')).toBe(false)
  })
})

// #468: these presets used to live inside ShapeView, so only the canvas could draw
// them and every other surface fell back to a rectangle. They are shared geometry
// now, and this is where their outlines are pinned.
describe('preset polygons (#468)', () => {
  // A 200x100 box at the origin, so each normalised component lands on a round
  // number and a wrong table shows up as a wrong coordinate.
  const box = { x: 0, y: 0, w: 200, h: 100 }

  it('recognises every preset, generated or tabulated', () => {
    for (const type of Object.keys(PRESET_POLYGONS)) expect(isPresetPolygon(type)).toBe(true)
    // star has no table entry — it is generated — so a table lookup would miss it.
    expect(isPresetPolygon('star')).toBe(true)
  })

  // A freely-drawn polygon carries its own points and must NOT be answered here,
  // or it would render as an empty outline instead of the shape the user drew.
  it('claims neither the free polygon nor the box shapes', () => {
    for (const type of ['polygon', 'rectangle', 'rounded', 'ellipse', 'triangle', 'diamond']) {
      expect(isPresetPolygon(type), `${type} is not a preset`).toBe(false)
      expect(presetPolygonPoints({ ...box, type })).toBe('')
    }
  })

  it('scales the tabulated outlines onto the box', () => {
    expect(presetPolygonPoints({ ...box, type: 'hexagon' }))
      .toBe('50,0 150,0 200,50 150,100 50,100 0,50')
    expect(presetPolygonPoints({ ...box, type: 'pentagon' }))
      .toBe('100,0 200,38 164,100 36,100 0,38')
    expect(presetPolygonPoints({ ...box, type: 'arrow' }))
      .toBe('0,30 124,30 124,5 200,50 124,95 124,70 0,70')
  })

  it('generates a five-pointed star, first point straight up', () => {
    const points = presetPolygonPoints({ ...box, type: 'star' }).split(' ')
    expect(points).toHaveLength(10)
    expect(points[0]).toBe('100,0') // outer vertex at the top centre
    // Alternating radii: the second is the inner one, so it sits nearer the centre.
    const [, firstInnerY] = points[1].split(',').map(Number)
    expect(firstInnerY).toBeGreaterThan(0)
    expect(firstInnerY).toBeLessThan(50)
  })

  // The points string is interpolated straight into export markup, so a persisted
  // box has to be coerced the same way polygonPointsString coerces its vertices.
  it('coerces a crafted box instead of letting it escape the attribute', () => {
    const points = presetPolygonPoints({ x: '0" onload="alert(1)', y: 0, w: 200, h: 100, type: 'hexagon' })
    expect(points).not.toMatch(/\son[a-z]+\s*=/i)
    expect(points).not.toContain('alert(1)')
  })
})

// #470: two shapes Custom Polygon cannot produce, because neither is regular.
describe('trapezoid and parallelogram (#470)', () => {
  const box = { x: 0, y: 0, w: 200, h: 100 }

  it('are presets, so every renderer draws them without a branch of its own', () => {
    expect(isPresetPolygon('trapezoid')).toBe(true)
    expect(isPresetPolygon('parallelogram')).toBe(true)
  })

  // Narrow side up is the convention. Both top vertices sit inside both bottom ones.
  it('stands the trapezoid on its long edge', () => {
    expect(presetPolygonPoints({ ...box, type: 'trapezoid' })).toBe('40,0 160,0 200,100 0,100')
  })

  // Equal and opposite offsets: the top edge shifts right by exactly what the
  // bottom edge gives up, which is what makes the opposite sides parallel.
  it('slants the parallelogram evenly, so its opposite sides stay parallel', () => {
    const points = presetPolygonPoints({ ...box, type: 'parallelogram' })
      .split(' ')
      .map((pair) => pair.split(',').map(Number))
    const [topLeft, topRight, bottomRight, bottomLeft] = points
    expect(topLeft[0] - bottomLeft[0]).toBeCloseTo(topRight[0] - bottomRight[0], 6)
    expect(topLeft[0]).toBeGreaterThan(0)
  })

  // The flowchart Input/Output node is the same shape. Reading one constant is what
  // stops the two slants drifting apart.
  it('takes its slant from the flowchart node that already had one', () => {
    const [topLeft] = presetPolygonPoints({ ...box, type: 'parallelogram' }).split(' ')
    expect(topLeft).toBe(`${SKEW_RATIO * box.w},0`)
  })
})
