// Snapshot-based undo/redo for the diagram store (CONVENTIONS: max 50 steps,
// snapshot = deep clone of {canvas,shapes,connectors}; selection is excluded).

const MAX_STEPS = 50

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// Capture the document slice that participates in history. The per-type
// sub-objects (mindmap/flowchart/whiteboard) are included so each type's edits
// are undoable; they are null for diagrams of a different type.
function snapshot(state) {
  return clone({
    canvas: state.canvas,
    shapes: state.shapes,
    connectors: state.connectors,
    mindmap: state.mindmap,
    flowchart: state.flowchart,
    whiteboard: state.whiteboard,
  })
}

// Apply a snapshot back onto the reactive state.
function restore(state, snap) {
  state.canvas = clone(snap.canvas)
  state.shapes = clone(snap.shapes)
  state.connectors = clone(snap.connectors)
  state.mindmap = clone(snap.mindmap)
  state.flowchart = clone(snap.flowchart)
  state.whiteboard = clone(snap.whiteboard)
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
