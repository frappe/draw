// THE diagram document store (CONVENTIONS "useDiagramStore.js — THE store API").
// createDiagramStore(initialDocument) returns a reactive object owned by
// EditorShell and provided as 'diagramStore'. useDiagramStore() injects it.
// All shape/connector mutations are history-tracked via commit().

import { reactive, computed, provide, inject } from 'vue'
import { createShape, createConnector, nextId } from '@/diagram/factories.js'
import { makeSection } from '@/diagram/sections.js'
import { createHistory } from '@/stores/history.js'
import { findThemePreset, DEFAULT_THEME_PRESET } from '@/diagram/theme.js'
import { createDiagramDocument, SCHEMA_VERSION, DEFAULT_DIAGRAM_TYPE } from '@/diagram/schema.js'
import { addChild, addSibling, addRootNode } from '@/diagram/mindmapModel.js'
import {
  addFlowchartNode,
  addFlowchartEdge,
  removeFlowchartNode,
  removeFlowchartEdge,
  flowchartNodeById,
  flowchartEdgeById,
} from '@/diagram/flowchartModel.js'
import {
  addStroke,
  removeStroke,
  addStickyNote,
  removeStickyNote,
  strokeById,
  stickyNoteById,
  addLine,
  removeLine,
  lineById,
  addTable,
  removeTable,
  tableById,
  setTableCell,
  applyVote,
  clearVote,
} from '@/diagram/whiteboardModel.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'

const STORE_KEY = 'diagramStore'

export function createDiagramStore(initialDocument) {
  const document = initialDocument || createDiagramDocument()
  const state = reactive({
    diagramType: document.diagramType || DEFAULT_DIAGRAM_TYPE,
    canvas: { ...document.canvas },
    shapes: clone(document.shapes || []),
    connectors: clone(document.connectors || []),
    sections: clone(document.sections || []),
    mindmap: document.mindmap ? clone(document.mindmap) : null,
    flowchart: document.flowchart ? clone(document.flowchart) : null,
    whiteboard: document.whiteboard ? clone(document.whiteboard) : null,
    selection: [],
    themePreset: document.themePreset || DEFAULT_THEME_PRESET,
  })
  const history = createHistory(state)
  return assembleStore(state, history)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// Build the full method surface around reactive state + history.
function assembleStore(state, history) {
  const store = reactive({ state })
  attachQueries(store, state)
  attachShapeMutations(store, state, history)
  attachConnectorMutations(store, state, history)
  attachSections(store, state, history)
  attachSelection(store, state)
  attachOrdering(store, state, history)
  attachGrouping(store, state, history)
  attachThemeAndCanvas(store, state, history)
  attachMindMap(store, state, history)
  attachFlowchart(store, state, history)
  attachWhiteboard(store, state, history)
  attachDocumentIo(store, state, history)
  attachHistory(store, history)
  return store
}

// Mind-map tree mutations (spec diagram-types Part A). They run the pure model
// helpers inside commit() so each is one undoable unit (Part G6); layout is
// derived from the model, never stored. No-ops for non-mindmap diagrams.
function attachMindMap(store, state, history) {
  store.addChildNode = (parentId, side = null) => {
    if (!state.mindmap) return null
    let id = null
    history.commit('Add child', () => (id = addChild(state.mindmap, parentId, '', side)))
    return id
  }
  // First idea on an empty map (spec: blank mind map starts truly empty).
  store.addRootNode = (text = '') => {
    if (!state.mindmap) return null
    let id = null
    history.commit('Add idea', () => (id = addRootNode(state.mindmap, text)))
    return id
  }
  store.addSiblingNode = (nodeId) => {
    if (!state.mindmap) return null
    let id = null
    history.commit('Add sibling', () => (id = addSibling(state.mindmap, nodeId)))
    return id
  }
  store.updateNode = (id, patch) =>
    history.commit('Update node', () => {
      const node = state.mindmap?.nodes.find((n) => n.id === id)
      if (node) applyPatch(node, patch)
    })
}

// Flowchart mutations (spec diagram-types Part B). Each runs the pure model
// helper inside commit() so it is one undoable unit (Part G6). Positions live on
// the model (manual placement is allowed, B7); layout reflow is a model edit too.
// No-ops for non-flowchart diagrams. The F-step agent calls these helpers.
function attachFlowchart(store, state, history) {
  store.addFlowchartNode = (nodeType, text = '', x = 0, y = 0) => {
    if (!state.flowchart) return null
    let id = null
    history.commit('Add node', () => (id = addFlowchartNode(state.flowchart, nodeType, text, x, y)))
    return id
  }
  store.updateFlowchartNode = (id, patch) =>
    history.commit('Update node', () => {
      const node = flowchartNodeById(state.flowchart || {}, id)
      if (node) applyPatch(node, patch)
    })
  store.removeFlowchartNode = (id) => {
    if (!state.flowchart) return
    history.commit('Delete node', () => {
      removeFlowchartNode(state.flowchart, id)
      // Drop the dead id from the selection, like the block/connector removers —
      // else it lingers and flowchartKeydown's selectedNode() resolves to a ghost,
      // silently killing keyboard building until the user clicks another node.
      state.selection = state.selection.filter((sid) => sid !== id)
    })
  }
  // Delete several flowchart nodes (+ their edges) as ONE undoable unit.
  store.removeFlowchartNodes = (ids) => {
    if (!state.flowchart || !ids?.length) return
    history.commit('Delete nodes', () => {
      for (const id of ids) removeFlowchartNode(state.flowchart, id)
      state.selection = state.selection.filter((sid) => !ids.includes(sid))
    })
  }
  store.addFlowchartEdge = (fromNodeId, toNodeId, partial = {}) => {
    if (!state.flowchart) return null
    let id = null
    history.commit('Connect', () => (id = addFlowchartEdge(state.flowchart, fromNodeId, toNodeId, partial)))
    return id
  }
  store.updateFlowchartEdge = (id, patch) =>
    history.commit('Update edge', () => {
      const edge = flowchartEdgeById(state.flowchart || {}, id)
      if (edge) applyPatch(edge, patch)
    })
  store.removeFlowchartEdge = (id) => {
    if (!state.flowchart) return
    history.commit('Delete edge', () => removeFlowchartEdge(state.flowchart, id))
  }
  // Generic per-type model update so the agent can run a custom multi-step edit
  // (Tidy up, insert-reflow, direction toggle) as one undoable unit (Part G6).
  store.updateFlowchartModel = (label, mutatorFn) => {
    if (!state.flowchart) return
    history.commit(label, () => mutatorFn(state.flowchart))
  }
}

// Whiteboard mutations (spec diagram-types Part C). Strokes are simplified by the
// agent on pointer-up before they reach addStroke (Part G7). Each mutation is one
// undoable unit (Part G6); no-ops for non-whiteboard diagrams.
function attachWhiteboard(store, state, history) {
  store.addStroke = (points, partial = {}) => {
    if (!state.whiteboard) return null
    let id = null
    history.commit('Draw', () => (id = addStroke(state.whiteboard, points, partial)))
    return id
  }
  store.updateStroke = (id, patch) =>
    history.commit('Update stroke', () => {
      const stroke = strokeById(state.whiteboard || {}, id)
      if (stroke) applyPatch(stroke, patch)
    })
  store.removeStroke = (id) => {
    if (!state.whiteboard) return
    history.commit('Erase', () => {
      removeStroke(state.whiteboard, id)
      clearVote(state.whiteboard, 'stroke', id)
    })
  }
  store.addStickyNote = (x, y, partial = {}) => {
    if (!state.whiteboard) return null
    let id = null
    history.commit('Add sticky', () => (id = addStickyNote(state.whiteboard, x, y, partial)))
    return id
  }
  store.updateStickyNote = (id, patch) =>
    history.commit('Update sticky', () => {
      const note = stickyNoteById(state.whiteboard || {}, id)
      if (note) applyPatch(note, patch)
    })
  store.removeStickyNote = (id) => {
    if (!state.whiteboard) return
    history.commit('Delete sticky', () => {
      removeStickyNote(state.whiteboard, id)
      clearVote(state.whiteboard, 'sticky', id)
    })
  }
  attachWhiteboardLines(store, state, history)
  attachWhiteboardTables(store, state, history)
  // Per-object up/down vote (T3): one undoable unit; dir is 'up' | 'down'.
  store.voteWhiteboardObject = (kind, id, dir, delta = 1) => {
    if (!state.whiteboard) return
    history.commit('Vote', () => applyVote(state.whiteboard, kind, id, dir, delta))
  }
  // Generic per-type model update (e.g. sketch-style toggle) as one undoable unit.
  store.updateWhiteboardModel = (label, mutatorFn) => {
    if (!state.whiteboard) return
    history.commit(label, () => mutatorFn(state.whiteboard))
  }
  // Delete a mixed set of whiteboard objects ([{kind,id}]) as ONE undoable unit
  // (multi-selection Delete). Per-kind model removers, all in a single commit.
  const WB_REMOVE = {
    stroke: removeStroke, sticky: removeStickyNote, line: removeLine,
    table: removeTable,
  }
  const removeWhiteboardObjectsInto = (items) => {
    for (const { kind, id } of items || []) {
      WB_REMOVE[kind]?.(state.whiteboard, id)
      clearVote(state.whiteboard, kind, id) // don't leak votes for deleted objects
    }
  }
  store.removeWhiteboardObjects = (items) => {
    if (!state.whiteboard || !items?.length) return
    history.commit('Delete objects', () => removeWhiteboardObjectsInto(items))
  }
  // Delete whiteboard objects AND block shapes/connectors (e.g. images) as ONE
  // undoable unit — Select All on a whiteboard can select both, so a single
  // Delete should undo in one step (not two).
  store.removeWhiteboardSelection = (items, ids = []) => {
    if (!state.whiteboard) return
    const shapeIds = ids.filter((id) => store.shapeById(id))
    const connectorIds = ids.filter((id) => store.connectorById(id))
    history.commit('Delete', () => {
      removeWhiteboardObjectsInto(items)
      if (shapeIds.length) removeShapesInternal(state, shapeIds)
      if (connectorIds.length) removeConnectorsInternal(state, connectorIds)
    })
  }
}

// Straight lines with selectable endpoints (none/arrow/dot). One undoable unit each.
function attachWhiteboardLines(store, state, history) {
  store.addLine = (x1, y1, x2, y2, partial = {}) => {
    if (!state.whiteboard) return null
    let id = null
    history.commit('Add line', () => (id = addLine(state.whiteboard, x1, y1, x2, y2, partial)))
    return id
  }
  store.updateLine = (id, patch) =>
    history.commit('Update line', () => {
      const line = lineById(state.whiteboard || {}, id)
      if (line) applyPatch(line, patch)
    })
  store.removeLine = (id) => {
    if (!state.whiteboard) return
    history.commit('Delete line', () => {
      removeLine(state.whiteboard, id)
      clearVote(state.whiteboard, 'line', id)
    })
  }
}

// Simple fixed-grid tables with per-cell text. One undoable unit each.
function attachWhiteboardTables(store, state, history) {
  store.addTable = (x, y, partial = {}) => {
    if (!state.whiteboard) return null
    let id = null
    history.commit('Add table', () => (id = addTable(state.whiteboard, x, y, partial)))
    return id
  }
  store.updateTable = (id, patch) =>
    history.commit('Update table', () => {
      const table = tableById(state.whiteboard || {}, id)
      if (table) applyPatch(table, patch)
    })
  store.setTableCell = (id, row, col, text) =>
    history.commit('Edit cell', () => {
      const table = tableById(state.whiteboard || {}, id)
      if (table) setTableCell(table, row, col, text)
    })
  store.removeTable = (id) => {
    if (!state.whiteboard) return
    history.commit('Delete table', () => {
      removeTable(state.whiteboard, id)
      clearVote(state.whiteboard, 'table', id)
    })
  }
}

// Read helpers that features lean on.
function attachQueries(store, state) {
  store.shapeById = (id) => state.shapes.find((shape) => shape.id === id)
  store.connectorById = (id) => state.connectors.find((c) => c.id === id)
  store.selectedShapes = computed(() =>
    state.shapes.filter((shape) => state.selection.includes(shape.id)),
  )
  // The reference ("key") shape for align/match-size: the LAST one the user
  // clicked. state.selection preserves click order (toggle/add append), whereas
  // selectedShapes re-derives in z-order — so align must read selection, not the
  // filtered array, or it snaps to whichever shape happens to sit last in z.
  store.lastSelectedShape = computed(() => {
    for (let i = state.selection.length - 1; i >= 0; i -= 1) {
      const shape = state.shapes.find((s) => s.id === state.selection[i])
      if (shape) return shape
    }
    return null
  })
  // Capability check for the unified canvas: does this document carry the given
  // sub-model? Features should branch on this (content-driven) rather than on the
  // single `diagramType` string, so a unified doc — which has all sub-models —
  // enables every tool. For legacy single-type docs this matches the old behaviour.
  store.hasSubModel = (subModel) => state[subModel] != null
}

function maxZIndex(shapes) {
  return shapes.reduce((max, shape) => Math.max(max, shape.zIndex || 0), 0)
}

function attachShapeMutations(store, state, history) {
  store.addShape = (partial) => {
    const shape = createShape({ zIndex: maxZIndex(state.shapes) + 1, ...partial }, state.themePreset)
    history.commit('Add shape', () => state.shapes.push(shape))
    return shape.id
  }
  store.updateShape = (id, patch) =>
    history.commit('Update shape', () => applyPatch(store.shapeById(id), patch))
  store.updateShapes = (ids, patch) =>
    history.commit('Update shapes', () =>
      ids.forEach((id) => applyPatch(store.shapeById(id), patch)),
    )
  store.removeShapes = (ids) =>
    history.commit('Delete shapes', () => removeShapesInternal(state, ids))
  store.removeConnectors = (ids) =>
    history.commit('Delete connectors', () => removeConnectorsInternal(state, ids))
  store.removeSelectionOrIds = (ids) => removeMixed(store, state, history, ids || state.selection)
  store.duplicate = (ids) => duplicateInternal(store, state, history, ids)
}

// Shallow-merge a patch, deep-merging known nested objects so callers can
// update e.g. only border.width without dropping the rest.
function applyPatch(target, patch) {
  if (!target) return
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      // Deep-merge nested objects so patching one field (e.g. text.style.bold)
      // doesn't wipe its siblings (size, italic, align). Fixes text formatting
      // "losing" edits across all diagram types.
      applyPatch(target[key], value)
    } else {
      target[key] = value
    }
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function removeShapesInternal(state, ids) {
  state.shapes = state.shapes.filter((shape) => !ids.includes(shape.id))
  state.connectors = state.connectors.filter(
    (c) => !ids.includes(c.from?.shapeId) && !ids.includes(c.to?.shapeId),
  )
  state.selection = state.selection.filter((id) => !ids.includes(id))
}

function removeConnectorsInternal(state, ids) {
  state.connectors = state.connectors.filter((c) => !ids.includes(c.id))
  state.selection = state.selection.filter((id) => !ids.includes(id))
}

function removeMixed(store, state, history, ids) {
  const shapeIds = ids.filter((id) => store.shapeById(id))
  const connectorIds = ids.filter((id) => store.connectorById(id))
  history.commit('Delete', () => {
    if (shapeIds.length) removeShapesInternal(state, shapeIds)
    if (connectorIds.length) removeConnectorsInternal(state, connectorIds)
  })
}

// Duplicate shapes (+10/+10); copy connectors only if both endpoints duplicated.
function duplicateInternal(store, state, history, ids) {
  const newIds = []
  history.commit('Duplicate', () => {
    const idMap = duplicateShapes(store, state, ids, newIds)
    duplicateConnectors(state, ids, idMap)
  })
  store.select(newIds)
  return newIds
}

function duplicateShapes(store, state, ids, newIds) {
  const idMap = {}
  let zIndex = maxZIndex(state.shapes)
  for (const id of ids) {
    const source = store.shapeById(id)
    if (!source) continue
    zIndex += 1
    const copy = createShape({ ...clone(source), id: undefined, x: source.x + 24, y: source.y + 24, zIndex }, state.themePreset)
    idMap[id] = copy.id
    newIds.push(copy.id)
    state.shapes.push(copy)
  }
  return idMap
}

// Duplicate a connector when each endpoint is either free or attached to a shape
// being duplicated; remap attached endpoints to the new ids and offset free ones
// by +10/+10. Mirrors useClipboard so duplicate (Cmd+D) and copy/paste agree.
function duplicateConnectors(state, ids, idMap) {
  for (const c of state.connectors) {
    if (!endpointDuplicated(c.from, ids) || !endpointDuplicated(c.to, ids)) continue
    const copy = createConnector({ ...clone(c), id: undefined })
    copy.from = remapDuplicatedEndpoint(c.from, idMap)
    copy.to = remapDuplicatedEndpoint(c.to, idMap)
    state.connectors.push(copy)
  }
}

function endpointDuplicated(endpoint, ids) {
  return !endpoint?.shapeId || ids.includes(endpoint.shapeId)
}

function remapDuplicatedEndpoint(endpoint, idMap) {
  if (endpoint?.shapeId) return { ...endpoint, shapeId: idMap[endpoint.shapeId] }
  return { ...endpoint, x: (endpoint?.x || 0) + 10, y: (endpoint?.y || 0) + 10 }
}

// Sections (named grouping frames) — one undoable unit each; document-level so
// they work in every diagram type (spec).
function attachSections(store, state, history) {
  store.sectionById = (id) => state.sections.find((s) => s.id === id)
  store.addSection = (x, y, w, h, partial = {}) => {
    const section = makeSection(x, y, w, h, partial)
    history.commit('Add section', () => state.sections.push(section))
    return section.id
  }
  store.updateSection = (id, patch) =>
    history.commit('Update section', () => applyPatch(store.sectionById(id), patch))
  store.removeSection = (id) =>
    history.commit('Delete section', () => (state.sections = state.sections.filter((s) => s.id !== id)))
}

function attachConnectorMutations(store, state, history) {
  store.addConnector = (partial) => {
    const connector = createConnector(partial)
    history.commit('Add connector', () => state.connectors.push(connector))
    return connector.id
  }
  store.updateConnector = (id, patch) =>
    history.commit('Update connector', () => applyPatch(store.connectorById(id), patch))
}

function attachSelection(store, state) {
  store.select = (ids) => (state.selection = Array.isArray(ids) ? [...ids] : [ids])
  store.addToSelection = (ids) => {
    const next = Array.isArray(ids) ? ids : [ids]
    state.selection = [...new Set([...state.selection, ...next])]
  }
  store.toggleInSelection = (id) => {
    state.selection = state.selection.includes(id)
      ? state.selection.filter((existing) => existing !== id)
      : [...state.selection, id]
  }
  store.clearSelection = () => (state.selection = [])
  store.selectAll = () => {
    // Locked / hidden shapes are set aside: Select All skips them so a bulk
    // nudge or delete can't reach them (spec 7.4).
    state.selection = [
      ...state.shapes.filter((s) => !s.locked && !s.hidden).map((shape) => shape.id),
      ...state.connectors.map((c) => c.id),
    ]
    // A whiteboard's freehand/sticky/line/table objects live in the whiteboard UI
    // selection, not state.selection — Select All must reach them too, or Cmd+A →
    // Delete would leave the board untouched (T1). Image shapes (ordinary block
    // shapes) are already covered by state.selection above.
    if (state.diagramType === 'whiteboard' && state.whiteboard) {
      const wb = state.whiteboard
      const all = [
        ...wb.strokes.map((o) => ({ kind: 'stroke', id: o.id })),
        ...wb.stickyNotes.map((o) => ({ kind: 'sticky', id: o.id })),
        ...(wb.lines || []).map((o) => ({ kind: 'line', id: o.id })),
        ...(wb.tables || []).map((o) => ({ kind: 'table', id: o.id })),
      ]
      useWhiteboardUi().setSelection(all)
    }
  }
  // Expand a set of shape ids to include every shape sharing a groupId with any
  // of them, so a group selects/moves/deletes as one unit. Non-grouped ids pass
  // through unchanged; connector ids (no groupId) are preserved.
  store.expandGroups = (ids) => {
    const list = Array.isArray(ids) ? ids : [ids]
    const groups = new Set(
      list.map((id) => state.shapes.find((s) => s.id === id)?.groupId).filter(Boolean),
    )
    if (!groups.size) return [...new Set(list)]
    const out = new Set(list)
    for (const shape of state.shapes) {
      if (shape.groupId && groups.has(shape.groupId)) out.add(shape.id)
    }
    return [...out]
  }
}

// z-order operations operate on selected shapes and re-pack indices afterwards.
function attachOrdering(store, state, history) {
  store.bringToFront = (ids) => reorder(state, history, 'To front', ids, (s) => 1e6 + (ids.indexOf(s.id)))
  store.sendToBack = (ids) => reorder(state, history, 'To back', ids, (s) => -1e6 - (ids.length - ids.indexOf(s.id)))
  store.bringForward = (ids) => reorder(state, history, 'Forward', ids, (s) => s.zIndex + 1.5)
  store.sendBackward = (ids) => reorder(state, history, 'Backward', ids, (s) => s.zIndex - 1.5)
}

function reorder(state, history, label, ids, scoreFn) {
  history.commit(label, () => {
    for (const shape of state.shapes) {
      if (ids.includes(shape.id)) shape.zIndex = scoreFn(shape)
    }
    repackZIndex(state)
  })
}

// Normalise zIndex to a dense 1..n ordering after a move.
function repackZIndex(state) {
  const ordered = [...state.shapes].sort((a, b) => a.zIndex - b.zIndex)
  ordered.forEach((shape, index) => (shape.zIndex = index + 1))
}

function attachGrouping(store, state, history) {
  store.group = (ids) => {
    // Use the shared monotonic id source (counter + client salt), NOT Date.now():
    // two groups minted in the same millisecond would otherwise share an id and
    // merge into one selectable/movable unit via expandGroups.
    const groupId = nextId('g')
    history.commit('Group', () =>
      state.shapes.forEach((shape) => {
        if (ids.includes(shape.id)) shape.groupId = groupId
      }),
    )
  }
  store.ungroup = (ids) =>
    history.commit('Ungroup', () =>
      state.shapes.forEach((shape) => {
        if (ids.includes(shape.id)) delete shape.groupId
      }),
    )
}

function attachThemeAndCanvas(store, state, history) {
  store.applyTheme = (presetName) =>
    history.commit('Apply theme', () => {
      const previousPreset = state.themePreset
      state.themePreset = presetName
      restyleShapes(state, presetName, previousPreset)
    })
  store.setCanvas = (patch) => history.commit('Canvas', () => Object.assign(state.canvas, patch))
}

// Re-paint only shapes that still wear the PREVIOUS preset's triad, so a user's
// deliberate fill/border/text-color overrides survive a theme change (the
// CONVENTIONS contract: applyTheme restyles shapes that use theme triads).
function restyleShapes(state, presetName, previousPreset) {
  const next = findThemePreset(presetName).t
  const previous = findThemePreset(previousPreset).t
  for (const shape of state.shapes) {
    if (shape.type === 'text') continue
    if (shape.fill === previous.fill) shape.fill = next.fill
    if (shape.border?.color === previous.stroke) {
      shape.border = { ...shape.border, color: next.stroke }
    }
    if (shape.text?.style?.color === previous.ink) {
      shape.text = { ...shape.text, style: { ...shape.text.style, color: next.ink } }
    }
  }
}

function attachDocumentIo(store, state, history) {
  store.getDocument = () => ({
    schemaVersion: SCHEMA_VERSION,
    diagramType: state.diagramType,
    canvas: clone(state.canvas),
    shapes: clone(state.shapes),
    connectors: clone(state.connectors),
    sections: clone(state.sections || []),
    mindmap: state.mindmap ? clone(state.mindmap) : null,
    flowchart: state.flowchart ? clone(state.flowchart) : null,
    whiteboard: state.whiteboard ? clone(state.whiteboard) : null,
    themePreset: state.themePreset,
  })
  store.loadDocument = (document) => {
    state.diagramType = document.diagramType || DEFAULT_DIAGRAM_TYPE
    state.canvas = { ...document.canvas }
    state.shapes = clone(document.shapes || [])
    state.connectors = clone(document.connectors || [])
    state.sections = clone(document.sections || [])
    state.mindmap = document.mindmap ? clone(document.mindmap) : null
    state.flowchart = document.flowchart ? clone(document.flowchart) : null
    state.whiteboard = document.whiteboard ? clone(document.whiteboard) : null
    state.themePreset = document.themePreset || DEFAULT_THEME_PRESET
    state.selection = []
    history.clear()
  }
}

function attachHistory(store, history) {
  store.undo = history.undo
  store.redo = history.redo
  store.commit = history.commit
  store.canUndo = computed(() => history.canUndo())
  store.canRedo = computed(() => history.canRedo())
}

export function provideDiagramStore(store) {
  provide(STORE_KEY, store)
  return store
}

export function useDiagramStore() {
  return inject(STORE_KEY)
}
