import { describe, it, expect } from 'vitest'
import { simplifyStroke } from './strokeSimplify.js'

describe('simplifyStroke (RDP)', () => {
  it('passes through paths of two or fewer points', () => {
    expect(simplifyStroke([])).toEqual([])
    const one = [{ x: 1, y: 1 }]
    expect(simplifyStroke(one)).toEqual(one)
    const two = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    expect(simplifyStroke(two)).toEqual(two)
  })

  it('drops collinear interior points', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
      { x: 20, y: 0 },
    ]
    expect(simplifyStroke(line, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ])
  })

  it('keeps a point that deviates beyond the tolerance', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 8 }, // 8 units off the straight line
      { x: 20, y: 0 },
    ]
    const result = simplifyStroke(path, 1.5)
    expect(result).toHaveLength(3)
  })

  it('removes a point within the tolerance band', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 1 }, // within 1.5 of the line
      { x: 20, y: 0 },
    ]
    const result = simplifyStroke(path, 1.5)
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ])
  })

  it('always preserves the first and last points', () => {
    const path = Array.from({ length: 50 }, (_, i) => ({ x: i, y: Math.sin(i) * 0.1 }))
    const result = simplifyStroke(path, 1)
    expect(result[0]).toEqual(path[0])
    expect(result.at(-1)).toEqual(path.at(-1))
    expect(result.length).toBeLessThan(path.length)
  })
})
