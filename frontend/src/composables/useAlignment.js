// Align selected shapes to a reference object (spec §4.3). The reference is the
// last-selected shape; aligning needs a multi-selection (2+ shapes). The whole
// move is one store.commit so it undoes as a single step — shape fields are
// mutated directly inside the commit (mixing in the self-committing updateShape
// would push extra history entries). Uses axis-aligned bounding boxes so rotated
// shapes align by their extent (§7.6).

import { computed } from 'vue'
import { axisAlignedBBox } from '@/diagram/geometry.js'

export function useAlignment(store) {
  const shapes = computed(() => store.selectedShapes)

  // The reference rect: the last-selected shape's bbox.
  function referenceRect() {
    return axisAlignedBBox(shapes.value[shapes.value.length - 1])
  }

  // Shift a shape so the chosen edge/center of its bbox lands on the target.
  function shiftShape(shape, axis, target, targetOf) {
    const delta = target - targetOf(axisAlignedBBox(shape))
    if (axis === 'x') shape.x += delta
    else shape.y += delta
  }

  // Apply an edge/center alignment to every selected shape in one commit.
  function alignEach(axis, targetOf, label) {
    if (shapes.value.length < 2) return
    const target = targetOf(referenceRect())
    store.commit(label, () => {
      for (const shape of shapes.value) shiftShape(shape, axis, target, targetOf)
    })
  }

  return {
    alignLeft: () => alignEach('x', (r) => r.x, 'Align left'),
    alignCenter: () => alignEach('x', (r) => r.x + r.w / 2, 'Align center'),
    alignRight: () => alignEach('x', (r) => r.x + r.w, 'Align right'),
    alignTop: () => alignEach('y', (r) => r.y, 'Align top'),
    alignMiddle: () => alignEach('y', (r) => r.y + r.h / 2, 'Align middle'),
    alignBottom: () => alignEach('y', (r) => r.y + r.h, 'Align bottom'),
    store,
  }
}
