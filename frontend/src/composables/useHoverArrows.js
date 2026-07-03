// Hover-arrows (signature, spec §5.3): hovering an unselected shape reveals four
// blue mid-edge arrows; clicking one spawns a connected same-type shape in that
// direction, linked by a connector, ready for text. Also exposes a shared
// screen-to-logical point converter used by the canvas interaction layers.

import { ref, computed } from 'vue'
import { anchorPoint, pointInShape, axisAlignedBBox } from '@/diagram/geometry.js'

const ARROW_OFFSET = 34
const ARROW_HIT = 18 // comfort margin around each arrow circle for the keep-alive band
const SPAWN_GAP = 60

// Where the four arrows sit (mid-edge anchor + outward direction).
const DIRECTIONS = [
  { key: 'top', anchor: 'top', dx: 0, dy: -1 },
  { key: 'right', anchor: 'right', dx: 1, dy: 0 },
  { key: 'bottom', anchor: 'bottom', dx: 0, dy: 1 },
  { key: 'left', anchor: 'left', dx: -1, dy: 0 },
]

// Opposite anchor on the spawned shape, so the connector joins their facing edges.
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

export function useHoverArrows(store, editorUi) {
  const hoverShapeId = ref(null)

  const hoverShape = computed(() => {
    if (!hoverShapeId.value) return null
    if (store.state.selection.includes(hoverShapeId.value)) return null
    if (editorUi.state.tool !== 'select') return null
    return store.shapeById(hoverShapeId.value) || null
  })

  // Topmost shape under a logical point (search descending zIndex).
  function shapeAt(point) {
    const ordered = [...store.state.shapes].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
    return ordered.find((shape) => pointInShape(point, shape)) || null
  }

  // The band around a shape where its hover-arrows live, so the pointer can leave
  // the shape body to REACH an arrow without the arrows vanishing (F1).
  function withinArrowBand(point, shape) {
    const b = axisAlignedBBox(shape)
    const m = ARROW_OFFSET + ARROW_HIT
    return point.x >= b.x - m && point.x <= b.x + b.w + m && point.y >= b.y - m && point.y <= b.y + b.h + m
  }

  function setHover(point) {
    const shape = shapeAt(point)
    if (shape) {
      hoverShapeId.value = shape.id
      return
    }
    // No shape directly under the pointer: keep the current shape's arrows while
    // the pointer is still within its arrow band (moving out to click one).
    const current = hoverShape.value
    if (current && withinArrowBand(point, current)) return
    hoverShapeId.value = null
  }

  function clearHover() {
    hoverShapeId.value = null
  }

  // Screen-edge button positions for the current hover shape.
  const arrows = computed(() => {
    const shape = hoverShape.value
    if (!shape) return []
    return DIRECTIONS.map((dir) => {
      const base = anchorPoint(shape, dir.anchor)
      return { ...dir, x: base.x + dir.dx * ARROW_OFFSET, y: base.y + dir.dy * ARROW_OFFSET }
    })
  })

  // New shape geometry, placed one gap beyond the source in the chosen direction.
  function spawnBox(shape, dir) {
    const x = dir.dx === 0 ? shape.x : shape.x + dir.dx * (shape.w + SPAWN_GAP)
    const y = dir.dy === 0 ? shape.y : shape.y + dir.dy * (shape.h + SPAWN_GAP)
    return { type: shape.type, x, y, w: shape.w, h: shape.h }
  }

  // Spawn a connected same-type shape in a direction and connect facing edges.
  function spawnInDirection(dirKey) {
    const shape = hoverShape.value
    const dir = DIRECTIONS.find((entry) => entry.key === dirKey)
    if (!shape || !dir) return null
    const newId = store.addShape(spawnBox(shape, dir))
    store.addConnector({
      type: 'straight',
      from: { shapeId: shape.id, anchor: dir.anchor },
      to: { shapeId: newId, anchor: OPPOSITE[dir.anchor] },
    })
    store.select(newId)
    hoverShapeId.value = null
    return newId
  }

  return { hoverShapeId, hoverShape, arrows, setHover, clearHover, spawnInDirection }
}
