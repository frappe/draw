// Move, resize, and rotate selected shapes from canvas drags (spec §5.4).
// Live mutations give 60fps feedback; the whole gesture is wrapped in a single
// history step on release. Arrow-key nudging is a discrete history step each.
import { rotatePoint, shapeCenter } from '@/diagram/geometry.js'
import { useSmartGuides } from '@/composables/useSmartGuides.js'

const ROTATION_SNAP = [0, 30, 45, 60, 90]
const NUDGE_SMALL = 1
const NUDGE_LARGE = 10

export function useShapeTransform(store, editorUi) {
  const move = createMover(store)
  const resize = createResizer(store)
  const rotate = createRotator(store)
  const nudge = createNudger(store)
  return { startMove: move, startResize: resize, startRotate: rotate, nudge }
}

// Snapshot the geometry of the shapes a gesture will touch.
function snapshotShapes(store, ids) {
  return ids.map((id) => {
    const shape = store.shapeById(id)
    return { id, x: shape.x, y: shape.y, w: shape.w, h: shape.h, rotation: shape.rotation || 0 }
  })
}

// Restore live shapes to their pre-gesture geometry (so commit snapshots cleanly).
function restoreShapes(store, originals) {
  for (const original of originals) Object.assign(store.shapeById(original.id), original)
}

// Re-apply the final geometry computed during the drag, inside one history step.
function commitGeometry(store, label, finals) {
  store.commit(label, () => {
    for (const final of finals) Object.assign(store.shapeById(final.id), final)
  })
}

// Attach window pointer listeners; each event is converted to a logical point
// via toLogical, then onMove runs until release, then onEnd. Returns a cleanup.
function runDrag(toLogical, onMove, onEnd) {
  function handleMove(event) {
    onMove(event, toLogical(event))
  }
  function handleUp(event) {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    onEnd(event, toLogical(event))
  }
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
}

// Drag the selection body to translate every selected shape together.
// The raw drag delta is snapped to alignment guides before being applied.
function createMover(store) {
  const smartGuides = useSmartGuides(store)
  return ({ toLogical, start, ids }) => {
    const originals = snapshotShapes(store, ids)
    const apply = (point) => {
      const raw = { x: point.x - start.x, y: point.y - start.y }
      const snapped = smartGuides.snapDelta(ids, originals, raw)
      return originals.map((o) => ({ id: o.id, x: o.x + snapped.x, y: o.y + snapped.y }))
    }
    runDrag(
      toLogical,
      (event, point) => applyLive(store, apply(point)),
      (event, point) => {
        finishGesture(store, 'Move', originals, apply(point))
        smartGuides.clear()
      },
    )
  }
}

// Apply a list of geometry patches directly to the live (reactive) shapes.
function applyLive(store, patches) {
  for (const patch of patches) Object.assign(store.shapeById(patch.id), patch)
}

// End a gesture: restore originals, then commit the final patches as one step.
function finishGesture(store, label, originals, finals) {
  restoreShapes(store, originals)
  if (geometryChanged(originals, finals)) commitGeometry(store, label, finals)
}

function geometryChanged(originals, finals) {
  return finals.some((final) => {
    const before = originals.find((o) => o.id === final.id)
    return Object.keys(final).some((key) => key !== 'id' && final[key] !== before[key])
  })
}

// Resize one shape via a corner/edge handle; Shift preserves aspect ratio.
function createResizer(store) {
  return ({ toLogical, handle, id }) => {
    const [original] = snapshotShapes(store, [id])
    const fixed = fixedCornerWorld(original, handle)
    const apply = (point, lockAspect) => [resizeShape(original, handle, point, fixed, lockAspect)]
    runDrag(
      toLogical,
      (event, point) => applyLive(store, apply(point, event.shiftKey)),
      (event, point) => finishGesture(store, 'Resize', [original], apply(point, event.shiftKey)),
    )
  }
}

// Rotate one shape around its center; Shift snaps to the fixed-angle family.
function createRotator(store) {
  return ({ toLogical, id }) => {
    const [original] = snapshotShapes(store, [id])
    const center = shapeCenter(original)
    const apply = (point, snap) => [{ id, rotation: pointerAngle(center, point, snap) }]
    runDrag(
      toLogical,
      (event, point) => applyLive(store, apply(point, event.shiftKey)),
      (event, point) => finishGesture(store, 'Rotate', [original], apply(point, event.shiftKey)),
    )
  }
}

// Arrow-key nudge of the whole selection (Shift = larger increment).
function createNudger(store) {
  return (dx, dy, large) => {
    const step = large ? NUDGE_LARGE : NUDGE_SMALL
    const ids = store.state.selection.filter((id) => store.shapeById(id))
    if (!ids.length) return
    const patches = ids.map((id) => nudgePatch(store.shapeById(id), dx * step, dy * step))
    store.commit('Nudge', () => applyLive(store, patches))
  }
}

function nudgePatch(shape, dx, dy) {
  return { id: shape.id, x: shape.x + dx, y: shape.y + dy }
}

// The world point of the handle opposite the dragged one — it stays put on resize.
function fixedCornerWorld(shape, handle) {
  const opposite = oppositeFactors(handle)
  const local = { x: shape.x + shape.w * opposite.fx, y: shape.y + shape.h * opposite.fy }
  return rotatePoint(local, shapeCenter(shape), shape.rotation)
}

// Mid-edge handles fix the opposite edge; corners fix the opposite corner.
function oppositeFactors(handle) {
  const map = {
    'top-left': { fx: 1, fy: 1 }, 'top-right': { fx: 0, fy: 1 },
    'bottom-left': { fx: 1, fy: 0 }, 'bottom-right': { fx: 0, fy: 0 },
    top: { fx: 0.5, fy: 1 }, bottom: { fx: 0.5, fy: 0 },
    left: { fx: 1, fy: 0.5 }, right: { fx: 0, fy: 0.5 },
  }
  return map[handle]
}

// Recompute x/y/w/h so the dragged handle reaches the pointer, opposite fixed.
function resizeShape(shape, handle, point, fixed, lockAspect) {
  const local = rotatePoint(point, fixed, -shape.rotation)
  const size = resizedSize(shape, handle, local, fixed, lockAspect)
  const topLeftLocal = topLeftFromFixed(handle, fixed, size)
  const topLeftWorld = recenter(topLeftLocal, fixed, size, shape.rotation)
  return { id: shape.id, x: topLeftWorld.x, y: topLeftWorld.y, w: size.w, h: size.h }
}

// New width/height implied by the pointer, clamped to a minimum, aspect-locked.
function resizedSize(shape, handle, local, fixed, lockAspect) {
  const horizontal = handle.includes('left') || handle.includes('right')
  const vertical = handle.includes('top') || handle.includes('bottom')
  let w = horizontal ? Math.max(8, Math.abs(local.x - fixed.x)) : shape.w
  let h = vertical ? Math.max(8, Math.abs(local.y - fixed.y)) : shape.h
  if (lockAspect && horizontal && vertical) [w, h] = lockToAspect(shape, w, h)
  return { w, h }
}

function lockToAspect(shape, w, h) {
  const ratio = shape.w / shape.h
  return w / h > ratio ? [h * ratio, h] : [w, w / ratio]
}

// Local-frame top-left of the new box given the fixed handle stays in place.
function topLeftFromFixed(handle, fixed, size) {
  const opposite = oppositeFactors(handle)
  return { x: fixed.x - size.w * opposite.fx, y: fixed.y - size.h * opposite.fy }
}

// Map a local top-left back to world space, keeping the fixed handle anchored.
function recenter(topLeftLocal, fixed, size, rotation) {
  const centerLocal = { x: topLeftLocal.x + size.w / 2, y: topLeftLocal.y + size.h / 2 }
  const centerWorld = rotatePoint(centerLocal, fixed, rotation)
  return { x: centerWorld.x - size.w / 2, y: centerWorld.y - size.h / 2 }
}

// Angle (deg) from center to pointer so the rotation handle points at the cursor.
function pointerAngle(center, point, snap) {
  const radians = Math.atan2(point.y - center.y, point.x - center.x)
  const degrees = (radians * 180) / Math.PI + 90
  const normalized = (degrees + 360) % 360
  return snap ? snapAngle(normalized) : Math.round(normalized)
}

// Snap to the nearest member of the 0/30/45/60/90 family around the circle.
function snapAngle(angle) {
  const candidates = ROTATION_SNAP.flatMap((base) => [0, 90, 180, 270].map((q) => (base + q) % 360))
  return candidates.reduce((best, c) => (angularGap(angle, c) < angularGap(angle, best) ? c : best))
}

function angularGap(a, b) {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}
