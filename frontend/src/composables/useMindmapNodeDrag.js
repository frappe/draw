// Dragging a mind-map node to re-parent or re-order it (#427 item 4).
//
// A mind map is pure auto-layout, so the drag never moves the node: it picks a
// slot in the TREE and the layout does the placing. That is why nothing here
// writes to the store until the drop — the ghost and the drop indicator are local
// state, so a gesture costs no history steps, no autosave traffic, and no re-flow
// per frame. One commit lands at the end, or none at all if the drag is cancelled
// or would change nothing.
//
// A module-level singleton, like useTextEditing: the drag layer renders from the
// same state the selection layer starts, without prop plumbing through the canvas.

import { reactive, computed } from 'vue'
import { contextWithout, dropSlotsFor, dropTargetAt, isNoOpDrop } from '@/diagram/mindmapDrop.js'

// Matches useShapeTransform's threshold, so a mind-map node and a block shape both
// decide "this is a drag, not a click" at the same distance — and a plain click
// still opens the label editor.
const MOVE_THRESHOLD = 3

const state = reactive({ nodeId: null, dx: 0, dy: 0, slot: null, active: false })

let session = null

export function useMindmapNodeDrag(store = null) {
  if (store) session = { store }
  return { state, start, cancel, isActive: computed(() => state.active) }
}

function reset() {
  Object.assign(state, { nodeId: null, dx: 0, dy: 0, slot: null, active: false })
}

// Abandon the gesture without committing — Escape, or a cancelled pointer.
export function cancel() {
  reset()
}

// Begin a drag on `nodeId`. `toLogical` converts a pointer event to canvas units
// (the canvas's one transform, so this works at any zoom or pan), `start` is the
// press point. Slots are computed ONCE: the tree cannot change mid-gesture.
function start({ toLogical, start: origin, nodeId }) {
  const store = session?.store
  if (!store) return
  const context = contextWithout(store.state.shapes, nodeId)
  const slots = dropSlotsFor(context, nodeId)
  Object.assign(state, { nodeId, dx: 0, dy: 0, slot: null, active: false })
  runGesture(store, { toLogical, origin, nodeId, slots })
}

function runGesture(store, { toLogical, origin, nodeId, slots }) {
  let frame = null
  let lastPoint = origin
  const onMove = (event) => {
    const point = toLogical(event)
    lastPoint = point
    state.dx = point.x - origin.x
    state.dy = point.y - origin.y
    if (!state.active && Math.hypot(state.dx, state.dy) < MOVE_THRESHOLD) return
    state.active = true
    // One slot search per frame, not per event: a mind map can carry hundreds of
    // slots and a pointer fires far faster than it paints (G11). This only drives
    // the INDICATOR — the drop resolves the slot itself, from the release point.
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = null
      state.slot = dropTargetAt(lastPoint, slots)
    })
  }
  const onEnd = () => {
    if (frame) cancelAnimationFrame(frame)
    teardown()
    const { nodeId: dragged, active } = state
    // Resolve where the node lands from the release point, not from whatever the
    // last painted frame happened to hold: a quick flick can cross the threshold
    // and release inside a single frame, and cancelling that frame would otherwise
    // throw away the only slot the gesture ever found.
    const slot = active ? dropTargetAt(lastPoint, slots) : null
    reset()
    if (slot && !isNoOpDrop(store.state.shapes, dragged, slot)) {
      store.moveMindmapNode(dragged, slot)
    }
  }
  // A cancelled pointer (a touch scroll claiming the gesture) and Escape both drop
  // the drag without moving anything. Nothing was written during the drag, so
  // abandoning it needs no undo — which is the point of committing only at the end.
  const onAbort = (event) => {
    if (event.type === 'keydown' && event.key !== 'Escape') return
    if (frame) cancelAnimationFrame(frame)
    teardown()
    reset()
  }
  function teardown() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', onAbort)
    window.removeEventListener('keydown', onAbort)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onEnd)
  window.addEventListener('pointercancel', onAbort)
  window.addEventListener('keydown', onAbort)
}
