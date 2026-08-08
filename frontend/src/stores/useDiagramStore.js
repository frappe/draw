// THE diagram document store (CONVENTIONS "useDiagramStore.js — THE store API").
// createDiagramStore(initialDocument, name) returns a reactive object owned by
// EditorShell and provided as 'diagramStore'. useDiagramStore() injects it.
// All shape/connector mutations are history-tracked via commit().

import { reactive, computed, provide, inject } from 'vue'
import { createShape, createConnector, nextId } from '@/diagram/factories.js'
import { createHistory } from '@/stores/history.js'
import { clone } from '@/utils/clone.js'
import { findThemePreset, DEFAULT_THEME_PRESET } from '@/diagram/theme.js'
import { createDiagramDocument, SCHEMA_VERSION, DEFAULT_DIAGRAM_TYPE } from '@/diagram/schema.js'
import { addChild, addSibling, addRootNode, createMindMap, subtreeIds } from '@/diagram/mindmapModel.js'
import { ROLE, isMindmapShape, isFlowchartShape, flattenSubmodels } from '@/diagram/freeFloating.js'
import { mindmapModelFromShapes } from '@/diagram/freeFloatingGraph.js'
import { buildMindmapChild, buildMindmapSibling, buildFlowchartChild, flowchartLayoutPatches, mindmapLayoutPatches } from '@/diagram/freeFloatingOps.js'
import { useAppSettings } from '@/composables/useAppSettings.js'
import {
  createFlowchart,
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
  mergeTableCells,
  unmergeTableCell,
  whiteboardObjectsInZOrder,
  maxWhiteboardZIndex,
} from '@/diagram/whiteboardModel.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'

const STORE_KEY = 'diagramStore'

export function createDiagramStore(initialDocument, name = null) {
  const document = initialDocument || createDiagramDocument()
  const state = reactive({
    // The Draw Diagram record name (set by EditorShell). Used to attach inserted
    // images to this diagram on upload (useImageInsert). null in the read-only viewer.
    name,
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

// ----- Inserting a free-floating starter (free-floating #122) -----------------
// The palette used to seed the legacy mindmap/flowchart SUB-MODEL, so a freshly
// inserted map/chart rendered through the framed path — no marquee, no "+" handles,
// no keyboard grow — until the document was saved and reloaded (which migrates it).
// The insert now runs the SAME migration engine the loader does: it builds a tiny
// one-node starter sub-model, flattens it to a role-tagged shape (+ any connectors),
// and drops that on the shared canvas. A fresh insert is therefore identical to a
// migrated one from the first frame, no reload — mooting the fresh-insert cases of
// #120/#121/#129. The legacy sub-models are left empty (never populated), so the
// framed render layers draw nothing.

// How far a repeat insert steps off content it would otherwise land exactly on.
const INSERT_NUDGE = 40

// Combined bounding box of a non-empty shape list, in canvas coordinates.
function shapesBBox(shapes) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const shape of shapes) {
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.w)
    maxY = Math.max(maxY, shape.y + shape.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

// Shift `shapes` so their combined bbox is centred in `view` (the logical on-screen
// rect), then step diagonally off any existing shape the centred spot covers — so a
// repeat insert into the same view doesn't land exactly on the last one. Connectors
// bind to the shapes by id (#138 anchors), so moving the shapes carries them along;
// only the shapes need shifting. A null `view` leaves the baked coordinates as they
// are (nothing on screen to centre against).
function placeShapesInView(shapes, view, existing) {
  if (!view || !shapes.length) return
  const box = shapesBBox(shapes)
  let x = view.x + (view.w - box.w) / 2
  let y = view.y + (view.h - box.h) / 2
  for (let guard = 0; guard < 40 && existing.some((s) => rectsOverlap({ x, y, w: box.w, h: box.h }, s)); guard += 1) {
    x += INSERT_NUDGE
    y += INSERT_NUDGE
  }
  const dx = x - box.x
  const dy = y - box.y
  for (const shape of shapes) {
    shape.x += dx
    shape.y += dy
  }
}

// Shift `shapes` so the FIRST shape's centre lands on `origin` — the explicit
// click-to-place point (#75). The rest move by the same delta so a multi-shape
// starter would stay coherent (a starter is a single node today). Connectors ride
// along by id like placeShapesInView. No overlap-nudge: the user picked the exact
// spot, so the node lands precisely under the click.
function placeShapesAtOrigin(shapes, origin) {
  if (!origin || !shapes.length) return
  const first = shapes[0]
  const dx = origin.x - (first.x + first.w / 2)
  const dy = origin.y - (first.y + first.h / 2)
  for (const shape of shapes) {
    shape.x += dx
    shape.y += dy
  }
}

// A minimal document carrying just one starter sub-model for the migration engine to
// flatten — every other layer empty, so flattenSubmodels emits only the starter.
function starterDocument(submodels) {
  return { shapes: [], connectors: [], sections: [], mindmap: null, flowchart: null, whiteboard: null, ...submodels }
}

// Flatten a starter sub-model and drop it on the canvas as ONE undoable unit: place
// it in view, stack it on top of existing content, and select its first shape so the
// user can name it straight away. state.mindmap / state.flowchart are untouched —
// the free-floating shapes ARE the map/chart now.
function commitStarter(store, state, history, label, submodels, view, origin = null) {
  const flat = flattenSubmodels(starterDocument(submodels), state.themePreset)
  // An explicit origin (click-to-place, #75) drops the first node on the click point;
  // otherwise centre the starter in the visible rect (#30), nudging off any overlap.
  if (origin) placeShapesAtOrigin(flat.shapes, origin)
  else placeShapesInView(flat.shapes, view, state.shapes)
  const z = nextZIndex(state)
  flat.shapes.forEach((shape, index) => (shape.zIndex = z + index))
  history.commit(label, () => {
    state.shapes.push(...flat.shapes)
    state.connectors.push(...flat.connectors)
  })
  if (flat.shapes[0]) store.select([flat.shapes[0].id])
}

// Mind-map tree mutations (spec diagram-types Part A). They run the pure model
// helpers inside commit() so each is one undoable unit (Part G6); layout is
// derived from the model, never stored. No-ops for non-mindmap diagrams.
function attachMindMap(store, state, history) {
  // Write a set of mind-map layout patches back onto the live shapes/connectors.
  // Shared by the auto-tidy on add (#273) and the explicit Tidy up; the caller runs
  // it INSIDE a commit() so the re-flow lands in the same undoable unit as the edit.
  const applyMindmapPatches = (patches) => {
    for (const patch of patches.nodes) {
      const shape = state.shapes.find((s) => s.id === patch.id)
      if (!shape) continue
      shape.x = patch.x
      shape.y = patch.y
    }
    for (const patch of patches.edges) {
      const connector = state.connectors.find((c) => c.id === patch.id)
      if (!connector) continue
      if (connector.from) connector.from.anchor = patch.fromAnchor
      if (connector.to) connector.to.anchor = patch.toAnchor
    }
  }
  // Re-flow the whole tree the shape belongs to (auto-tidy per #273), pinned by its
  // root, so a freshly added node and its shoved-aside siblings settle into the
  // balanced layout at once. Must run inside the caller's commit().
  const reflowTree = (memberId) =>
    applyMindmapPatches(mindmapLayoutPatches(state.shapes, state.connectors, memberId))

  // Densely renumber one parent's child shapes 0..n-1 by their current order (both
  // sides together — each side's relative order is preserved as a subsequence of the
  // global sort), keeping the order tags clean integers after a fractional insert.
  const renumberChildShapes = (parentShapeId) =>
    state.shapes
      .filter((s) => s.role === ROLE.mindmapNode && s.mindmap?.parentId === parentShapeId)
      .sort((a, b) => (a.mindmap?.order ?? 0) - (b.mindmap?.order ?? 0))
      .forEach((shape, i) => (shape.mindmap.order = i))

  // Add a child as a free-floating tagged shape + branch connector (free-floating
  // #122), one undoable unit. Used when the parent is a migrated mind-map SHAPE.
  const addChildShape = (parentShapeId, side) => {
    // A new child defaults to the user's saved "Mind map child nodes" style (#126):
    // 'shape' boxes it like the root, 'text' (default) keeps it Whimsical text (#125).
    const defaultShaped = useAppSettings().settings.mindmapChildStyle === 'shape'
    const built = buildMindmapChild(state.shapes, parentShapeId, state.themePreset, side, defaultShaped)
    if (!built) return null
    built.shape.zIndex = nextZIndex(state)
    history.commit('Add child', () => {
      state.shapes.push(built.shape)
      state.connectors.push(built.connector)
      reflowTree(parentShapeId)
    })
    return built.shape.id
  }
  // Gap insertion (#265): add a child at a specific ordinal `index` among the
  // parent's children on `side`, instead of always appending. Slots the new child
  // between the neighbours at that ordinal, then re-flows the tree — all one undoable
  // unit — so the "+" the user clicked (above / between / below existing children) is
  // exactly where the new node lands. The sibling group is scoped to the clicked side
  // (root children carry an explicit side; a deeper node's children all share its one
  // branch side), so inserting on one side never disturbs the other's ordering.
  const addChildAt = (parentShapeId, side, index) => {
    const parentShape = state.shapes.find((s) => s.id === parentShapeId)
    const defaultShaped = useAppSettings().settings.mindmapChildStyle === 'shape'
    const built = buildMindmapChild(state.shapes, parentShapeId, state.themePreset, side, defaultShaped)
    if (!built) return null
    built.shape.zIndex = nextZIndex(state)
    const parentIsRoot = !parentShape.mindmap?.parentId
    const targetSide = built.shape.mindmap.side
    history.commit('Add child', () => {
      // The same-side siblings in laid-out order. A root's children interleave both
      // sides in their global order, so read the ordinal against JUST this side.
      const sameSide = state.shapes
        .filter(
          (s) =>
            s.role === ROLE.mindmapNode &&
            s.mindmap?.parentId === parentShapeId &&
            (!parentIsRoot || s.mindmap?.side === targetSide),
        )
        .sort((a, b) => (a.mindmap?.order ?? 0) - (b.mindmap?.order ?? 0))
      // A fractional order that lands the new child at ordinal `index`: before the
      // first, between a neighbouring pair, or after the last. renumberChildShapes
      // densifies it back to a clean integer once it is in place.
      const orderAt = (i) => sameSide[i].mindmap.order ?? 0
      let order
      if (!sameSide.length) order = 0
      else if (index <= 0) order = orderAt(0) - 0.5
      else if (index >= sameSide.length) order = orderAt(sameSide.length - 1) + 0.5
      else order = (orderAt(index - 1) + orderAt(index)) / 2
      built.shape.mindmap.order = order
      state.shapes.push(built.shape)
      state.connectors.push(built.connector)
      renumberChildShapes(parentShapeId)
      reflowTree(parentShapeId)
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
  // Gap-insertion add (#265): insert a child at ordinal `index` on `side` and select
  // it so its own gap handles appear, ready to keep adding. Migrated shapes only —
  // the "+" handles the pointer op drives never target a legacy sub-model node.
  store.addChildNodeAt = (parentShapeId, side = null, index = 0) => {
    if (!isMindmapShape(state.shapes.find((s) => s.id === parentShapeId))) return null
    const id = addChildAt(parentShapeId, side, index)
    if (id) store.select([id])
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
      // A sibling is another child node, so honour the same style default (#126).
      const defaultShaped = useAppSettings().settings.mindmapChildStyle === 'shape'
      const built = buildMindmapSibling(state.shapes, nodeId, state.themePreset, defaultShaped)
      if (!built) return null
      built.shape.zIndex = nextZIndex(state)
      history.commit('Add sibling', () => {
        state.shapes.push(built.shape)
        state.connectors.push(built.connector)
        reflowTree(built.shape.mindmap.parentId)
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
  // Whimsical convert (#125): flip a migrated mind-map SHAPE between a boxed node
  // and transparent text. applyPatch deep-merges the tag, so only `shaped` changes.
  // The context menu offers this on non-root nodes only (the root is always a box).
  store.setMindmapNodeShaped = (id, shaped) =>
    history.commit('Convert node', () => applyPatch(store.shapeById(id), { mindmap: { shaped } }))
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
  // Templates/Insert (canvas unification): drop a starter mind map on the canvas.
  // Free-floating #122: this now creates a ROLE-TAGGED root SHAPE via the migration
  // engine (commitStarter) instead of seeding the legacy sub-model, so a fresh
  // insert is selectable / marquee-able / "+"-handle-able / keyboard-growable at
  // once — identical to a migrated map, no save+reload. A single empty root: no
  // default children, no default text (an empty node renders the greyed "New idea"
  // placeholder, so the user names it instead of clearing seeded text, #80). `view`
  // is the optional on-screen rect to centre it in (#30); a second insert lands
  // clear of the first (separate shapes, placeShapesInView nudges off any overlap).
  // `origin` is the optional click-to-place point (#75): when given it overrides the
  // view and drops the root exactly there.
  store.insertMindmapStarter = (view = null, origin = null) =>
    commitStarter(store, state, history, 'Insert mind map', { mindmap: createMindMap('') }, view, origin)
  // The mind-map counterpart of applyFlowchartShapeLayout (#122 P3): re-flow the
  // selected node's whole tree with the balanced auto-layout as an explicit "Tidy up".
  // A standalone map auto-layouts live via MindMapOverlay, but free-floating nodes are
  // manually-draggable shapes, so they need an explicit tidy. The pure helper
  // reconstructs the model, lays it out pinned by its root, and returns the shape /
  // connector patches; here we just write them back as one undoable unit. No-op when the
  // canvas holds no migrated mind-map nodes (or there is nothing to move). `rootId` is
  // the selected node — the action is scoped to that node's tree so a second,
  // independent map on the same canvas is left untouched (#48).
  store.applyMindmapShapeLayout = (label, rootId) => {
    const patches = mindmapLayoutPatches(state.shapes, state.connectors, rootId)
    if (!patches.nodes.length) return
    history.commit(label, () => applyMindmapPatches(patches))
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
  // The unified-canvas counterpart (#98): run a whole-graph layout action (Tidy up /
  // flip direction / number steps) over the FREE-FLOATING flowchart shapes, the way
  // updateFlowchartModel runs it over the standalone sub-model. The pure helper
  // reconstructs the model, applies `action(model)`, and returns the shape/connector
  // patches; here we just write them back as one undoable unit. No-op when the canvas
  // holds no migrated flowchart nodes. `rootId` is the selected node — the action is
  // scoped to that node's connected component so a second, independent flowchart on the
  // same canvas is left untouched (#167).
  store.applyFlowchartShapeLayout = (label, action, rootId = null) => {
    const patches = flowchartLayoutPatches(state.shapes, state.connectors, action, rootId)
    if (!patches.nodes.length) return
    history.commit(label, () => {
      for (const patch of patches.nodes) {
        const shape = state.shapes.find((s) => s.id === patch.id)
        if (!shape) continue
        shape.x = patch.x
        shape.y = patch.y
        if (shape.text) shape.text.content = patch.text
        shape.flowchart = {
          ...(shape.flowchart || {}),
          manuallyPositioned: patch.manuallyPositioned,
          direction: patch.direction,
        }
        if (patch.stepPrefix) shape.flowchart.stepPrefix = patch.stepPrefix
        else delete shape.flowchart.stepPrefix
      }
      for (const patch of patches.edges) {
        const connector = state.connectors.find((c) => c.id === patch.id)
        if (!connector) continue
        if (connector.from) connector.from.anchor = patch.fromAnchor
        if (connector.to) connector.to.anchor = patch.toAnchor
      }
    })
  }
  // Templates/Insert (canvas unification): drop a starter flowchart on the canvas.
  // Free-floating #122: this now creates a ROLE-TAGGED node SHAPE via the migration
  // engine (commitStarter) instead of seeding the legacy sub-model, so a fresh
  // insert behaves exactly like a migrated one (marquee / "+" handles / keyboard)
  // with no save+reload. A single node of the chosen type — no second step, no edge
  // (#80); empty text falls back to the type's default label (addFlowchartNode). The
  // palette exposes every node type (#86), so any of them can seed a chart. `view`
  // is the optional on-screen rect to centre it in (#30); a second insert lands
  // clear of the first (separate shapes, placeShapesInView nudges off any overlap).
  // `origin` is the optional click-to-place point (#75): when given it overrides the
  // view and drops the node exactly there.
  store.insertFlowchartStarter = (view = null, nodeType = 'terminator', origin = null) => {
    const flowchart = createFlowchart()
    addFlowchartNode(flowchart, nodeType, '', 0, 0)
    commitStarter(store, state, history, 'Insert flowchart', { flowchart }, view, origin)
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
    history.commit('Erase', () => removeStroke(state.whiteboard, id))
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
    history.commit('Delete sticky', () => removeStickyNote(state.whiteboard, id))
  }
  attachWhiteboardLines(store, state, history)
  attachWhiteboardTables(store, state, history)
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
    history.commit('Delete line', () => removeLine(state.whiteboard, id))
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
  store.mergeTableCells = (id, r0, c0, r1, c1) =>
    history.commit('Merge cells', () => {
      const table = tableById(state.whiteboard || {}, id)
      if (table) mergeTableCells(table, r0, c0, r1, c1)
    })
  store.unmergeTableCell = (id, row, col) =>
    history.commit('Split cell', () => {
      const table = tableById(state.whiteboard || {}, id)
      if (table) unmergeTableCell(table, row, col)
    })
  store.removeTable = (id) => {
    if (!state.whiteboard) return
    history.commit('Delete table', () => removeTable(state.whiteboard, id))
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
