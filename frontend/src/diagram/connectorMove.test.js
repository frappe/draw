import { describe, it, expect } from 'vitest'
import { connectorBodyMovable, translateConnectorBody } from './connectorMove.js'

describe('connectorBodyMovable (#542)', () => {
  it('is movable when both endpoints are free', () => {
    const connector = { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }
    expect(connectorBodyMovable(connector)).toBe(true)
  })

  it('is movable when only one endpoint is attached', () => {
    const connector = { from: { shapeId: 's1', anchor: 'right' }, to: { x: 10, y: 10 } }
    expect(connectorBodyMovable(connector)).toBe(true)
  })

  it('is pinned when both endpoints are attached — nothing to drag', () => {
    const connector = { from: { shapeId: 's1', anchor: 'right' }, to: { shapeId: 's2', anchor: 'left' } }
    expect(connectorBodyMovable(connector)).toBe(false)
  })
})

describe('translateConnectorBody (#542)', () => {
  it('translates both endpoints when both are free', () => {
    const connector = { from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }
    const patch = translateConnectorBody(connector, 5, -5)
    expect(patch).toEqual({ from: { x: 5, y: -5 }, to: { x: 15, y: 5 } })
  })

  it('leaves an attached endpoint out of the patch entirely — it follows its shape', () => {
    const connector = { from: { shapeId: 's1', anchor: 'right' }, to: { x: 10, y: 10 } }
    const patch = translateConnectorBody(connector, 5, 5)
    expect(patch.from).toBeUndefined()
    expect(patch.to).toEqual({ x: 15, y: 15 })
  })

  it('moves a stored curve midpoint along with the endpoints', () => {
    const connector = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, midpoint: { x: 5, y: -5 } }
    const patch = translateConnectorBody(connector, 2, 3)
    expect(patch.midpoint).toEqual({ x: 7, y: -2 })
  })

  it('moves a stored elbow midX along with the endpoints (#573)', () => {
    const connector = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, midX: 5 }
    const patch = translateConnectorBody(connector, 3, 4)
    expect(patch.midX).toBe(8)
  })

  it('produces an empty patch for a fully-attached connector', () => {
    const connector = { from: { shapeId: 's1' }, to: { shapeId: 's2' } }
    expect(translateConnectorBody(connector, 5, 5)).toEqual({})
  })
})
