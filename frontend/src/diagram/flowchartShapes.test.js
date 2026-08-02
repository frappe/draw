import { describe, it, expect } from 'vitest'
import { nodeShape } from './flowchartShapes.js'
import { NODE_TYPES } from './flowchartModel.js'

// nodeShape is the geometry the flowchart layer AND (post free-floating #122)
// ShapeView render migrated flowchart nodes with, so every node type must return
// a well-formed drawable primitive.
describe('nodeShape', () => {
  const W = 160
  const H = 80

  it('returns a drawable primitive for every node type', () => {
    for (const type of NODE_TYPES) {
      const shape = nodeShape(type, W, H)
      expect(['rect', 'ellipse', 'polygon', 'path']).toContain(shape.kind)
      if (shape.kind === 'polygon') expect(shape.points).toBeTruthy()
      if (shape.kind === 'path') expect(shape.d).toBeTruthy()
    }
  })

  it('maps the core types to the expected primitive', () => {
    expect(nodeShape('process', W, H).kind).toBe('rect')
    expect(nodeShape('terminator', W, H)).toEqual({ kind: 'rect', rx: H / 2 }) // stadium
    expect(nodeShape('decision', W, H).kind).toBe('polygon') // diamond
    expect(nodeShape('inputOutput', W, H).kind).toBe('polygon') // parallelogram
    expect(nodeShape('document', W, H).kind).toBe('path') // wavy bottom
    expect(nodeShape('database', W, H).kind).toBe('path') // cylinder
    expect(nodeShape('connector', W, H).kind).toBe('ellipse') // junction
  })

  it('falls back to a rounded rect for an unknown type', () => {
    expect(nodeShape('nonsense', W, H)).toEqual({ kind: 'rect', rx: 6 })
  })

  it('scales polygon points to the given box', () => {
    // Decision diamond spans the full box: its points touch each edge midpoint.
    const { points } = nodeShape('decision', W, H)
    expect(points).toContain(`${W / 2},0`)
    expect(points).toContain(`${W},${H / 2}`)
  })
})
