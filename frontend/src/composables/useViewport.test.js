import { describe, it, expect } from 'vitest'
import { useViewport } from './useViewport.js'

// centerPoint() is the anchor for anything inserted without a pointer position —
// a pasted image, or a mind map / flowchart frame from the palette (#30). It must
// invert the <g> transform (translate(pan) scale(zoom)) exactly, or the insert
// lands off-screen at anything but the default pan/zoom.
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

    // Round-trip: the returned point, pushed back through the render transform,
    // must land on the container centre.
    const { panX, panY, zoom } = viewport.state
    const point = viewport.centerPoint()
    expect(point.x * zoom + panX).toBeCloseTo(500, 6)
    expect(point.y * zoom + panY).toBeCloseTo(300, 6)
  })
})
