// Align selected shapes to a reference object or the canvas (spec §4.3). The
// reference is the last-selected shape; with alignToCanvas the canvas rect is
// used instead. The whole move is one store.commit so it undoes as a single
// step — shape fields are mutated directly inside the commit (mixing in the
// self-committing updateShape would push extra history entries). Uses
// axis-aligned bounding boxes so rotated shapes align by their extent (§7.6).

import { computed } from 'vue'
import { axisAlignedBBox } from '@/diagram/geometry.js'

export function useAlignment(store) {
  const shapes = computed(() => store.selectedShapes.value)

  // The reference rect: canvas bounds, or the last-selected shape's bbox.
  function referenceRect(alignToCanvas) {
    if (alignToCanvas) {
      return { x: 0, y: 0, w: store.state.canvas.width, h: store.state.canvas.height }
    }
    return axisAlignedBBox(shapes.value[shapes.value.length - 1])
  }

  // Shift a shape so the chosen edge/center of its bbox lands on the target.
  function shiftShape(shape, axis, target, targetOf) {
    const delta = target - targetOf(axisAlignedBBox(shape))
    if (axis === 'x') shape.x += delta
    else shape.y += delta
  }

  // Apply an edge/center alignment to every selected shape in one commit.
  function alignEach(axis, targetOf, label, alignToCanvas) {
    if (shapes.value.length < 2 && !alignToCanvas) return
    const target = targetOf(referenceRect(alignToCanvas))
    store.commit(label, () => {
      for (const shape of shapes.value) shiftShape(shape, axis, target, targetOf)
    })
  }

  return {
    alignLeft: (toCanvas) => alignEach('x', (r) => r.x, 'Align left', toCanvas),
    alignCenter: (toCanvas) => alignEach('x', (r) => r.x + r.w / 2, 'Align center', toCanvas),
    alignRight: (toCanvas) => alignEach('x', (r) => r.x + r.w, 'Align right', toCanvas),
    alignTop: (toCanvas) => alignEach('y', (r) => r.y, 'Align top', toCanvas),
    alignMiddle: (toCanvas) => alignEach('y', (r) => r.y + r.h / 2, 'Align middle', toCanvas),
    alignBottom: (toCanvas) => alignEach('y', (r) => r.y + r.h, 'Align bottom', toCanvas),
    store,
  }
}
