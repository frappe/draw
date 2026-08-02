// THE diagram document store (CONVENTIONS "useDiagramStore.js — THE store API").
// createDiagramStore(initialDocument) returns a reactive object owned by
// EditorShell and provided as 'diagramStore'. useDiagramStore() injects it.
// All shape/connector mutations are history-tracked via commit().

import { reactive, computed, provide, inject } from 'vue'
import { createShape, createConnector, nextId } from '@/diagram/factories.js'
import { createHistory } from '@/stores/history.js'
import { clone } from '@/utils/clone.js'
import { findThemePreset, DEFAULT_THEME_PRESET } from '@/diagram/theme.js'
import { createDiagramDocument, SCHEMA_VERSION, DEFAULT_DIAGRAM_TYPE } from '@/diagram/schema.js'
import { addChild, addSibling, addRootNode, addTree, nodeById, subtreeIds } from '@/diagram/mindmapModel.js'
import { layoutMindMap, mindmapTreeRects } from '@/diagram/mindmapLayout.js'
import { isMindmapShape, isFlowchartShape } from '@/diagram/freeFloating.js'
import { mindmapModelFromShapes } from '@/diagram/freeFloatingGraph.js'
import { buildMindmapChild, buildMindmapSibling, buildFlowchartChild } from '@/diagram/freeFloatingOps.js'
import {
  addFlowchartNode,
  addFlowchartEdge,
  removeFlowchartNode,
  removeFlowchartEdge,
  flowchartNodeById,
  flowchartEdgeById,
} from '@/diagram/flowchartModel.js'
import { flowchartContentBounds } from '@/diagram/flowchartLayout.js'
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
  whiteboardObjectsInZOrder,
  maxWhiteboardZIndex,
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
    // Bumped by loadDocument() so views can tell "a whole new document arrived"
    // apart from "the document was edited". Not part of the saved document, and
    // deliberately outside the history snapshot — undo must not look like a load.
    loadCount: 0,
  })
  const history = createHistory(state)
  return assembleStore(state, history)
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

// ----- Placing an inserted frame (#30) ---------------------------------------
// A frame's `origin` is its top-left on the shared canvas; its content sits at
// origin + the content bbox. Insert used to leave the origin at the document's
// fixed default, so a user who had panned away got a frame somewhere off-screen.
// It is now placed inside `view`, the logical rect the canvas currently shows.

const FRAME_GAP = 80

// The rect a frame occupies on the shared canvas.
function frameRect(origin, bbox) {
  return { x: origin.x + (bbox.x || 0), y: origin.y + (bbox.y || 0), w: bbox.w, h: bbox.h }
}

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return Math.max(0, w) * Math.max(0, h)
}

// The rect held by the auto-layout frame OTHER than `kind`, or null if it's empty.
// Both frames insert into the same view, so the second one needs to know where the
// first one sits.
function otherFrameRect(state, kind) {
  if (kind === 'mindmap') {
    const f = state.flowchart
    if (!f?.nodes.length) return null
    return frameRect(f.origin || { x: 0, y: 0 }, flowchartContentBounds(f))
  }
  const m = state.mindmap
  if (!m?.nodes.length) return null
  return frameRect(m.origin || { x: 0, y: 0 }, layoutMindMap(m).bbox)
}

// Where each mind-map tree sits on the shared canvas: the map's origin plus the
// tree's own offset within it (#48).
function treeRectsOnCanvas(model) {
  const origin = model.origin || { x: 0, y: 0 }
  return mindmapTreeRects(model, layoutMindMap(model).positions).map((rect) => ({
    ...rect,
    x: rect.x + origin.x,
    y: rect.y + origin.y,
  }))
}

// What a newly inserted mind-map tree has to sit clear of: every tree already on
// the map, plus the flowchart. One enclosing rect — placement only ever needs
// somewhere free, not the exact shape of what is taken.
function occupiedRect(state, trees, exceptRootId) {
  let rect = otherFrameRect(state, 'mindmap')
  for (const tree of trees) {
    if (tree.rootId !== exceptRootId) rect = union(rect, tree)
  }
  return rect
}

function union(a, b) {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

// One axis of a rect placed inside the view: kept within its bounds, or centred on
// it when the rect is the larger of the two.
function insideAxis(pos, size, min, extent) {
  if (size >= extent) return min + (extent - size) / 2
  return Math.min(Math.max(pos, min), min + extent - size)
}

function insideView(rect, view) {
  return {
    ...rect,
    x: insideAxis(rect.x, rect.w, view.x, view.w),
    y: insideAxis(rect.y, rect.h, view.y, view.h),
  }
}

function centredInView(size, view) {
  return { x: view.x + (view.w - size.w) / 2, y: view.y + (view.h - size.h) / 2, ...size }
}

// The four ways to sit clear of `avoid` — below, above, right, left — each centred
// in the view on the other axis and then pulled back inside it. That pull can leave
// a sliver of overlap when the view has no room to clear the other frame; a small
// overlap the user can drag apart beats a frame parked off-screen (#30).
function placementsClearing(size, view, avoid) {
  const centred = centredInView(size, view)
  return [
    { ...centred, y: avoid.y + avoid.h + FRAME_GAP },
    { ...centred, y: avoid.y - FRAME_GAP - size.h },
    { ...centred, x: avoid.x + avoid.w + FRAME_GAP },
    { ...centred, x: avoid.x - FRAME_GAP - size.w },
  ].map((rect) => insideView(rect, view))
}

// The origin that puts `bbox` in the middle of `view`, so an inserted frame appears
// where the user is looking — moved aside to whichever in-view placement covers the
// other frame least, which the document's fixed default origins used to prevent.
function frameOriginInView(bbox, view, avoid = null) {
  const size = { w: bbox.w, h: bbox.h }
  let rect = insideView(centredInView(size, view), view)
  if (avoid && overlapArea(rect, avoid) > 0) {
    rect = placementsClearing(size, view, avoid).reduce((best, next) =>
      overlapArea(next, avoid) < overlapArea(best, avoid) ? next : best,
    )
  }
  return { x: rect.x - (bbox.x || 0), y: rect.y - (bbox.y || 0) }
}

// Mind-map tree mutations (spec diagram-types Part A). They run the pure model
// helpers inside commit() so each is one undoable unit (Part G6); layout is
// derived from the model, never stored. No-ops for non-mindmap diagrams.
function attachMindMap(store, state, history) {
  // Add a child as a free-floating tagged shape + branch connector (free-floating
  // #122), one undoable unit. Used when the parent is a migrated mind-map SHAPE.
  const addChildShape = (parentShapeId, side) => {
    const built = buildMindmapChild(state.shapes, parentShapeId, state.themePreset, side)
    if (!built) return null
    built.shape.zIndex = nextZIndex(state)
    history.commit('Add child', () => {
      state.shapes.push(built.shape)
      state.connectors.push(built.connector)
    })
    return built.shape.id
  }
  // Representation-aware: a migrated node is a tagged shape (add child as a shape);
  // a freshly-inserted / legacy node lives in the sub-model (add child there).
  store.addChildNode = (parentId, side = null) => {
    if (isMindmapShape(state.shapes.find((s) => s.id === parentId))) return addChildShape(parentId, side)
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
    if (isMindmapShape(state.shapes.find((s) => s.id === nodeId))) {
      const built = buildMindmapSibling(state.shapes, nodeId, state.themePreset)
      if (!built) return null
      built.shape.zIndex = nextZIndex(state)
      history.commit('Add sibling', () => {
        state.shapes.push(built.shape)
        state.connectors.push(built.connector)
      })
      return built.shape.id
    }
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
  // Delete migrated mind-map SHAPES and their whole subtrees (free-floating #122):
  // reconstruct the tree from the tags, expand each id to its descendants, then drop
  // those shapes and any connector touching them — one undoable unit, no dangling
  // branches. Ids that are not mind-map shapes expand to just themselves.
  store.deleteMindmapSubtrees = (ids) => {
    const model = mindmapModelFromShapes(state.shapes)
    const remove = new Set()
    for (const id of ids || []) for (const sid of subtreeIds(model, id)) remove.add(sid)
    if (!remove.size) return
    history.commit('Delete', () => {
      state.shapes = state.shapes.filter((s) => !remove.has(s.id))
      state.connectors = state.connectors.filter(
        (c) => !remove.has(c.from?.shapeId) && !remove.has(c.to?.shapeId),
      )
    })
  }
  // Templates/Insert (canvas unification): drop a starter mind map on the canvas
  // as one undoable unit — always a NEW independent tree (root + two branches).
  //
  // Inserting used to graft "New idea" onto the existing root instead, because a
  // document held a single map (#48): a second Add mind map silently edited the
  // first one. Every tree now stands on its own and existing trees are never
  // touched by an insert.
  //
  // `view` is the optional logical canvas rect on screen, to place the new tree in
  // (#30). The first tree carries the whole map's origin (so a single-tree map
  // still saves exactly as before); later trees carry their own offset. The layout
  // is run inside the commit to get the seeded tree's real size; it is pure and
  // already derived on every render, so this costs nothing extra.
  store.insertMindmapStarter = (view = null) =>
    history.commit('Insert mind map', () => {
      const m = state.mindmap
      if (!m) return
      const first = !m.nodes.length
      // Start with a single empty root — no default children, no default text.
      // An empty node renders a greyed "New idea" placeholder (MindMapNodeLayer),
      // so the user names it instead of clearing seeded text (#80).
      const root = addTree(m, '')
      if (!view) return
      if (first) {
        m.origin = frameOriginInView(layoutMindMap(m).bbox, view, otherFrameRect(state, 'mindmap'))
        return
      }
      // The tree is laid out at a zero offset first, so the origin that puts it in
      // the view is just the move from where it landed to where it should sit.
      const trees = treeRectsOnCanvas(m)
      const rect = trees.find((tree) => tree.rootId === root)
      if (rect) {
        nodeById(m, root).origin = frameOriginInView(rect, view, occupiedRect(state, trees, root))
      }
    })
  // Move one mind-map tree on the unified canvas by a delta, as one undoable unit
  // — repositions that tree's own offset, leaving every other tree alone (#48).
  store.moveMindmapTree = (rootId, dx, dy) => {
    if (!state.mindmap || (!dx && !dy)) return
    const root = nodeById(state.mindmap, rootId)
    if (!root) return
    history.commit('Move mind map', () => {
      const o = root.origin || { x: 0, y: 0 }
      root.origin = { x: o.x + dx, y: o.y + dy }
    })
  }
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
  // Add a connected child as a free-floating tagged shape + edge connector
  // (free-floating #122), one undoable unit. Used when the parent is a migrated
  // flowchart SHAPE (state.flowchart is null after the flip), so the keyboard/handle
  // build path has a home the way addChildShape does for mind maps.
  store.addFlowchartChildShape = (parentShapeId, nodeType) => {
    const built = buildFlowchartChild(state.shapes, state.connectors, parentShapeId, nodeType)
    if (!built) return null
    built.shape.zIndex = nextZIndex(state)
    history.commit('Add node', () => {
      state.shapes.push(built.shape)
      state.connectors.push(built.connector)
    })
    return built.shape.id
  }
  // Delete migrated flowchart SHAPES and their touching edges (free-floating #122):
  // drop each selected flowchart-node shape plus any connector touching it — one
  // undoable unit, no dangling edges. Ids that are not flowchart shapes are ignored.
  // A flowchart delete removes just the node(s) + their edges, not a downstream
  // subtree, matching the sub-model removeFlowchartNodes.
  store.deleteFlowchartShapes = (ids) => {
    const remove = new Set(
      (ids || []).filter((id) => isFlowchartShape(state.shapes.find((s) => s.id === id))),
    )
    if (!remove.size) return
    history.commit('Delete', () => {
      state.shapes = state.shapes.filter((s) => !remove.has(s.id))
      state.connectors = state.connectors.filter(
        (c) => !remove.has(c.from?.shapeId) && !remove.has(c.to?.shapeId),
      )
      state.selection = state.selection.filter((sid) => !remove.has(sid))
    })
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
  // Templates/Insert (canvas unification): drop a starter flowchart on the canvas
  // as one undoable unit — always a NEW chart of two connected nodes.
  //
  // A repeat insert used to append a step to the last node AND wire an edge to it,
  // so a second Add flowchart extended the chart already there instead of making
  // its own (#48). The new chart is now placed clear of the existing content with
  // no edge tying the two together; its nodes are individually draggable, so it
  // needs no origin of its own.
  //
  // `view` places the FIRST chart in that logical on-screen rect (#30); it carries
  // the frame origin, which later charts must not move.
  store.insertFlowchartStarter = (view = null, nodeType = 'terminator') =>
    history.commit('Insert flowchart', () => {
      const m = state.flowchart
      if (!m) return
      const first = !m.nodes.length
      const bounds = first ? null : flowchartContentBounds(m)
      const x = bounds ? bounds.x : 0
      const y = bounds ? bounds.y + bounds.h + FRAME_GAP : 0
      // Start with a single node of the chosen type — no second step, no edge
      // (#80). Empty text falls back to the type's default label (addFlowchartNode).
      // The palette exposes every node type (#86), so any of them can seed a chart.
      addFlowchartNode(m, nodeType, '', x, y)
      if (first && view) {
        m.origin = frameOriginInView(flowchartContentBounds(m), view, otherFrameRect(state, 'flowchart'))
      }
    })
  // Move the flowchart frame on the unified canvas by a delta, as one undoable
  // unit — repositions its origin (its top-left on the canvas).
  store.moveFlowchartFrame = (dx, dy) => {
    const m = state.flowchart
    if (!m || (!dx && !dy)) return
    history.commit('Move flowchart', () => {
      const o = m.origin || { x: 0, y: 0 }
      m.origin = { x: o.x + dx, y: o.y + dy }
    })
  }
}

// Whiteboard mutations (spec diagram-types Part C). Strokes are simplified by the
// agent on pointer-up before they reach addStroke (Part G7). Each mutation is one
// undoable unit (Part G6); no-ops for non-whiteboard diagrams.
function attachWhiteboard(store, state, history) {
  store.addStroke = (points, partial = {}) => {
    if (!state.whiteboard) return null
    let id = null
    history.commit('Draw', () =>
      (id = addStroke(state.whiteboard, points, { zIndex: nextZIndex(state), ...partial })),
    )
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
    history.commit('Add sticky', () =>
      (id = addStickyNote(state.whiteboard, x, y, { zIndex: nextZIndex(state), ...partial })),
    )
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
    history.commit('Add line', () =>
      (id = addLine(state.whiteboard, x1, y1, x2, y2, { zIndex: nextZIndex(state), ...partial })),
    )
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
    history.commit('Add table', () =>
      (id = addTable(state.whiteboard, x, y, { zIndex: nextZIndex(state), ...partial })),
    )
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

// Shapes and whiteboard objects share one stacking scale (#27), so "on top"
// means above BOTH pools — otherwise an image added after a freehand stroke
// still lands underneath it.
function nextZIndex(state) {
  return Math.max(maxZIndex(state.shapes), maxWhiteboardZIndex(state.whiteboard)) + 1
}

// Every object that carries a zIndex, as a flat list — the pool the Arrange
// actions reorder and the renderers paint in order.
function stackedObjects(state) {
  return [
    ...state.shapes.map((shape) => ({ id: shape.id, object: shape })),
    ...whiteboardObjectsInZOrder(state.whiteboard || {}),
  ]
}

function attachShapeMutations(store, state, history) {
  store.addShape = (partial) => {
    const shape = createShape({ zIndex: nextZIndex(state), ...partial }, state.themePreset)
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
  let zIndex = nextZIndex(state) - 1
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
// they work in every diagram type (spec). Nothing creates them any more (the
// section tool left the toolbar in #42); sections in saved documents still
// render, and can be renamed, moved, resized and deleted.
function attachSections(store, state, history) {
  store.sectionById = (id) => state.sections.find((s) => s.id === id)
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
    for (const { id, object } of stackedObjects(state)) {
      if (ids.includes(id)) object.zIndex = scoreFn(object)
    }
    repackZIndex(state)
  })
}

// Normalise zIndex to a dense 1..n ordering after a move, across shapes AND
// whiteboard objects — they stack against each other, so re-packing one pool on
// its own would just recreate the overlap the move was meant to resolve.
function repackZIndex(state) {
  const ordered = stackedObjects(state).sort((a, b) => (a.object.zIndex || 0) - (b.object.zIndex || 0))
  ordered.forEach(({ object }, index) => (object.zIndex = index + 1))
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
    state.loadCount += 1
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
