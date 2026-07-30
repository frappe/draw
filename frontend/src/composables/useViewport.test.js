import { describe, it, expect } from 'vitest'
import { useViewport } from './useViewport.js'

// visibleRect()/centerPoint() anchor anything inserted without a pointer position —
// a pasted image, or a mind map / flowchart frame from the palette (#30). They must
// invert the <g> transform (translate(pan) scale(zoom)) exactly, or the insert
// lands off-screen at anything but the default pan/zoom.
describe('useViewport visibleRect', () => {
  it('is the container in logical units at the default pan/zoom', () => {
    const viewport = useViewport()
    viewport.setMeasure({ containerW: 1000, containerH: 600 })
    viewport.setPan(0, 0)
    const rect = viewport.visibleRect()
    expect(rect.x).toBeCloseTo(0, 6) // -0 from dividing a zero pan through the zoom
    expect(rect.y).toBeCloseTo(0, 6)
    expect(rect.w).toBe(1000)
    expect(rect.h).toBe(600)
  })

  it('follows a pan and divides through the zoom', () => {
    const viewport = useViewport()
    viewport.setMeasure({ containerW: 1000, containerH: 600 })
    viewport.setPan(-2000, -1000)
    viewport.setZoom(2)

    // Round-trip: the rect's corners, pushed back through the render transform,
    // must land on the container's corners.
    const { panX, panY, zoom } = viewport.state
    const rect = viewport.visibleRect()
    expect(rect.x * zoom + panX).toBeCloseTo(0, 6)
    expect(rect.y * zoom + panY).toBeCloseTo(0, 6)
    expect((rect.x + rect.w) * zoom + panX).toBeCloseTo(1000, 6)
    expect((rect.y + rect.h) * zoom + panY).toBeCloseTo(600, 6)
  })
})

describe('useViewport centerPoint', () => {
  it('is the container centre in logical units at the default pan/zoom', () => {
    const viewport = useViewport()
    viewport.setMeasure({ containerW: 1000, containerH: 600 })
    viewport.setPan(0, 0)
    expect(viewport.centerPoint()).toEqual({ x: 500, y: 300 })
  })

  it('follows a pan and divides through the zoom', () => {
    const viewport = useViewport()
    viewport.setMeasure({ containerW: 1000, containerH: 600 })
    viewport.setPan(-2000, -1000)
    viewport.setZoom(2)

    const { panX, panY, zoom } = viewport.state
    const point = viewport.centerPoint()
    expect(point.x * zoom + panX).toBeCloseTo(500, 6)
    expect(point.y * zoom + panY).toBeCloseTo(300, 6)
  })
})
