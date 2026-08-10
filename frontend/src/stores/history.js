// Snapshot-based undo/redo for the diagram store (CONVENTIONS: max 50 steps,
// snapshot = deep clone of {canvas,shapes,connectors,...} + the selection).
//
// Selection is captured so undo/redo restores focus the way Visio/Figma/Slides
// do — the objects affected by the step you reverse light up with their handles,
// instead of leaving you staring at a changed canvas with nothing selected.

import { ref } from 'vue'
import { clone } from '@/utils/clone.js'

const MAX_STEPS = 50

// Capture the document slice that participates in history. The per-type
// sub-objects (mindmap/flowchart/whiteboard) are included so each type's edits
// are undoable; they are null for diagrams of a different type. The selection is
// captured alongside so it can be restored as focus on undo/redo.
function snapshot(state) {
  return clone({
    diagramType: state.diagramType,
    canvas: state.canvas,
    shapes: state.shapes,
    connectors: state.connectors,
    sections: state.sections,
    mindmap: state.mindmap,
    flowchart: state.flowchart,
    whiteboard: state.whiteboard,
    selection: state.selection,
  })
}

// Apply a snapshot back onto the reactive state, then restore the selection that
// existed at that step — but only ids that still exist, so we never select a
// deleted object.
function restore(state, snap) {
  if (snap.diagramType) state.diagramType = snap.diagramType
  state.canvas = clone(snap.canvas)
  state.shapes = clone(snap.shapes)
  state.connectors = clone(snap.connectors)
  state.sections = clone(snap.sections || [])
  state.mindmap = clone(snap.mindmap)
  state.flowchart = clone(snap.flowchart)
  state.whiteboard = clone(snap.whiteboard)
  // Every id that can be selected via the shared store selection: block shapes +
  // connectors, sections, and the per-type node arrays (mind-map / flowchart).
  // Without the per-type ids, undo/redo of a mind-map or flowchart edit would
  // silently clear the selection (and the toolbar controls it drives) even though the node
  // still exists. Whiteboard objects use a separate UI selection store.
  const live = new Set([
    ...state.shapes.map((s) => s.id),
    ...state.connectors.map((c) => c.id),
    ...(state.sections || []).map((s) => s.id),
    ...(state.mindmap?.nodes || []).map((n) => n.id),
    ...(state.flowchart?.nodes || []).map((n) => n.id),
  ])
  state.selection = (snap.selection || []).filter((id) => live.has(id))
}

// Property drags (opacity/colour sliders, ruler text-insets, connector endpoint
// drags) fire an `Update …` commit per input event. Coalesce a rapid run of the
// SAME `Update …` label into one undo step — matching how editors merge typing —
// so one slider drag isn't ~50 undo steps. Movement (Move/Resize/Rotate/Nudge)
// already batches to a single commit on gesture-end, and Add/Delete/Connect
// labels never coalesce, so distinct actions each stay their own step.
const COALESCE_MS = 450

export function createHistory(state) {
  const past = []
  const future = []
  let lastLabel = null
  let lastTime = 0

  // The two stacks stay PLAIN arrays: each entry holds a deep clone of the whole
  // document, and making the stacks reactive would proxy every one of those.
  // So the depths are what the interface watches instead. Without them
  // `computed(() => history.canUndo())` reads a plain `length`, takes no
  // dependency, and caches its first answer for the life of the editor — which
  // is why canUndo/canRedo had been correct to call and useless to bind.
  const undoDepth = ref(0)
  const redoDepth = ref(0)

  function syncDepths() {
    undoDepth.value = past.length
    redoDepth.value = future.length
  }

  // Run a mutation, recording the prior snapshot so it can be undone.
  function commit(label, mutatorFn) {
    const now = Date.now()
    const coalesce =
      past.length > 0 &&
      label === lastLabel &&
      label.startsWith('Update ') &&
      now - lastTime < COALESCE_MS
    lastLabel = label
    lastTime = now
    if (coalesce) {
      // The prior entry already holds the pre-gesture snapshot; just apply and
      // keep it as the single undo step for the whole run.
      mutatorFn()
      future.length = 0
    } else {
      const before = snapshot(state)
      mutatorFn()
      past.push({ label, snap: before })
      if (past.length > MAX_STEPS) past.shift()
      future.length = 0
    }
    syncDepths()
  }

  function undo() {
    if (!past.length) return
    lastLabel = null // a subsequent commit must not merge into a pre-undo entry
    const entry = past.pop()
    future.push({ label: entry.label, snap: snapshot(state) })
    restore(state, entry.snap)
    syncDepths()
  }

  function redo() {
    if (!future.length) return
    lastLabel = null
    const entry = future.pop()
    past.push({ label: entry.label, snap: snapshot(state) })
    restore(state, entry.snap)
    syncDepths()
  }

  function clear() {
    past.length = 0
    future.length = 0
    lastLabel = null
    syncDepths()
  }

  return {
    commit,
    undo,
    redo,
    clear,
    canUndo: () => undoDepth.value > 0,
    canRedo: () => redoDepth.value > 0,
  }
}
