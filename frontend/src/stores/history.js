// Snapshot-based undo/redo for the diagram store (CONVENTIONS: max 50 steps,
// snapshot = deep clone of {canvas,shapes,connectors,...} + the selection).
//
// Selection is captured so undo/redo restores focus the way Visio/Figma/Slides
// do — the objects affected by the step you reverse light up with their handles,
// instead of leaving you staring at a changed canvas with nothing selected.

const MAX_STEPS = 50

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

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
  state.mindmap = clone(snap.mindmap)
  state.flowchart = clone(snap.flowchart)
  state.whiteboard = clone(snap.whiteboard)
  const live = new Set([
    ...state.shapes.map((s) => s.id),
    ...state.connectors.map((c) => c.id),
  ])
  state.selection = (snap.selection || []).filter((id) => live.has(id))
}

export function createHistory(state) {
  const past = []
  const future = []

  // Run a mutation, recording the prior snapshot so it can be undone.
  function commit(label, mutatorFn) {
    const before = snapshot(state)
    mutatorFn()
    past.push({ label, snap: before })
    if (past.length > MAX_STEPS) past.shift()
    future.length = 0
  }

  function undo() {
    if (!past.length) return
    const entry = past.pop()
    future.push({ label: entry.label, snap: snapshot(state) })
    restore(state, entry.snap)
  }

  function redo() {
    if (!future.length) return
    const entry = future.pop()
    past.push({ label: entry.label, snap: snapshot(state) })
    restore(state, entry.snap)
  }

  function clear() {
    past.length = 0
    future.length = 0
  }

  return {
    commit,
    undo,
    redo,
    clear,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  }
}
