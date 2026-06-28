// Distribute (equal spacing / remove gaps) for 3+ shapes and same-size matching
// to the last-selected reference (spec §4.3). Multi-shape moves mutate shape
// fields directly inside one store.commit so each action is a single undo step;
// the uniform size match uses store.updateShapes (already one commit). Works on
// axis-aligned bounding boxes so rotated shapes spread by their extent (§7.6).

import { computed } from 'vue'
import { axisAlignedBBox } from '@/diagram/geometry.js'

export function useDistribute(store) {
  const shapes = computed(() => store.selectedShapes)

  // Shapes sorted by their bbox position along an axis (x or y).
  function sortedAlong(axis) {
    return [...shapes.value].sort((a, b) => axisAlignedBBox(a)[axis] - axisAlignedBBox(b)[axis])
  }

  // Move a shape so its bbox start (x or y) lands on target.
  function placeStart(shape, axis, target) {
    const box = axisAlignedBBox(shape)
    if (axis === 'x') shape.x += target - box.x
    else shape.y += target - box.y
  }

  // Equal spacing: keep the extremes fixed, spread the inner shapes' gaps.
  function distribute(axis, sizeKey, label) {
    if (shapes.value.length < 3) return
    const ordered = sortedAlong(axis)
    const gap = (extent(ordered, axis, sizeKey) - totalSize(ordered, sizeKey)) / (ordered.length - 1)
    runFlow(ordered, axis, sizeKey, gap, label)
  }

  function totalSize(ordered, sizeKey) {
    return ordered.reduce((sum, shape) => sum + axisAlignedBBox(shape)[sizeKey], 0)
  }

  // Total distance from the first bbox start to the last bbox end on the axis.
  function extent(ordered, axis, sizeKey) {
    const first = axisAlignedBBox(ordered[0])
    const last = axisAlignedBBox(ordered[ordered.length - 1])
    return last[axis] + last[sizeKey] - first[axis]
  }

  // Lay shapes out from the first, leaving a fixed gap between each bbox.
  function runFlow(ordered, axis, sizeKey, gap, label) {
    store.commit(label, () => {
      let cursor = axisAlignedBBox(ordered[0])[axis]
      for (const shape of ordered) {
        placeStart(shape, axis, cursor)
        cursor += axisAlignedBBox(shape)[sizeKey] + gap
      }
    })
  }

  // Match width/height/both to the reference (last-selected) shape.
  function matchSizeTo(keys, label) {
    if (shapes.value.length < 2) return
    const reference = shapes.value[shapes.value.length - 1]
    const patch = {}
    for (const key of keys) patch[key] = reference[key]
    store.updateShapes(idsExcept(reference.id), patch)
  }

  function idsExcept(id) {
    return shapes.value.filter((shape) => shape.id !== id).map((shape) => shape.id)
  }

  // Stack shapes flush along their dominant spread axis (no gap between bboxes).
  function removeGaps() {
    if (shapes.value.length < 3) return
    const axis = dominantAxis()
    runFlow(sortedAlong(axis), axis, axis === 'x' ? 'w' : 'h', 0, 'Remove gaps')
  }

  // Pick the axis the selection is more spread along, to stack flush sensibly.
  function dominantAxis() {
    const xs = shapes.value.map((shape) => axisAlignedBBox(shape).x)
    const ys = shapes.value.map((shape) => axisAlignedBBox(shape).y)
    return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y'
  }

  // Lay the selection out on a tidy grid (Efficient Elements "arrange in grid"):
  // near-square column count, uniform cells sized to the largest shape, anchored
  // at the selection's top-left. One undo step.
  const GRID_GAP = 24
  function arrangeGrid() {
    const items = shapes.value
    if (items.length < 2) return
    const boxes = items.map((shape) => axisAlignedBBox(shape))
    const cols = Math.ceil(Math.sqrt(items.length))
    const cellW = Math.max(...boxes.map((box) => box.w)) + GRID_GAP
    const cellH = Math.max(...boxes.map((box) => box.h)) + GRID_GAP
    const originX = Math.min(...boxes.map((box) => box.x))
    const originY = Math.min(...boxes.map((box) => box.y))
    store.commit('Arrange in grid', () => {
      items.forEach((shape, index) => {
        placeStart(shape, 'x', originX + (index % cols) * cellW)
        placeStart(shape, 'y', originY + Math.floor(index / cols) * cellH)
      })
    })
  }

  // Swap the positions of exactly two shapes by their centers (so different
  // sizes trade places cleanly).
  function swapPositions() {
    if (shapes.value.length !== 2) return
    const [a, b] = shapes.value
    const ca = centerOf(a)
    const cb = centerOf(b)
    store.commit('Swap positions', () => {
      a.x += cb.x - ca.x
      a.y += cb.y - ca.y
      b.x += ca.x - cb.x
      b.y += ca.y - cb.y
    })
  }

  function centerOf(shape) {
    const box = axisAlignedBBox(shape)
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  }

  return {
    distributeHorizontal: () => distribute('x', 'w', 'Distribute horizontally'),
    distributeVertical: () => distribute('y', 'h', 'Distribute vertically'),
    removeGaps,
    matchWidth: () => matchSizeTo(['w'], 'Match width'),
    matchHeight: () => matchSizeTo(['h'], 'Match height'),
    matchSize: () => matchSizeTo(['w', 'h'], 'Match size'),
    arrangeGrid,
    swapPositions,
    store,
  }
}
