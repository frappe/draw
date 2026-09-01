// THE diagram document store (CONVENTIONS "useDiagramStore.js — THE store API").
// createDiagramStore(initialDocument, name) returns a reactive object owned by
// EditorShell and provided as 'diagramStore'. useDiagramStore() injects it.
// All shape/connector mutations are history-tracked via commit().

import { reactive, computed, provide, inject } from 'vue'
import { createShape, createConnector, nextId } from '@/diagram/factories.js'
import { createHistory } from '@/stores/history.js'
import { clone } from '@/utils/clone.js'
import { DEFAULT_THEME_PRESET } from '@/diagram/theme.js'
import { createDiagramDocument, SCHEMA_VERSION, DEFAULT_DIAGRAM_TYPE } from '@/diagram/schema.js'
import { addChild, addSibling, addRootNode, createMindMap, subtreeIds } from '@/diagram/mindmapModel.js'
import {
  ROLE,
  isMindmapShape,
  isFlowchartShape,
  isAuthoredConnector,
  flattenSubmodels,
  FLOWCHART_FALLBACK_TYPE,
} from '@/diagram/freeFloating.js'
import { createWhiteboard } from '@/diagram/whiteboardModel.js'
import {
  insertTableRow,
  deleteTableRow,
  insertTableColumn,
  deleteTableColumn,
  toggleHeaderThroughRow,
  setTableHeaderRows,
  toggleHeaderThroughColumn,
  setTableHeaderCols,
  clearTableCells,
  autoFitColumnWidth,
  autoFitRowHeight,
} from '@/diagram/tableStructure.js'
import { mindmapModelFromShapes, flowchartModelFromShapes, mindmapComponentIds } from '@/diagram/freeFloatingGraph.js'
import { buildMindmapChild, buildMindmapSibling, buildFlowchartChild, flowchartLayoutPatches, mindmapLayoutPatches } from '@/diagram/freeFloatingOps.js'
import { mindmapSizeForShape } from '@/diagram/mindmapNodeSize.js'
import { flowchartSizeForShape } from '@/diagram/flowchartNodeSize.js'
import { separateBoxes } from '@/diagram/flowchartLayout.js'
import { dropPatches } from '@/diagram/mindmapDrop.js'
import { DEFAULT_NODE_STYLE } from '@/diagram/mindmapNodeStyle.js'
import { useAppSettings } from '@/composables/useAppSettings.js'
import {
  createFlowchart,
  addFlowchartNode,
  addFlowchartEdge,
  removeFlowchartNode,
  removeFlowchartEdge,
  flowchartNodeById,
  flowchartEdgeById,
  swapNodeType,
  outgoingEdges,
  terminatorText,
} from '@/diagram/flowchartModel.js'
import {
  addStroke,
  removeStroke,
  addStickyNote,
  removeStickyNote,
  setStickyRuns,
  setStickyTextStyle,
  strokeById,
  stickyNoteById,
  addLine,
  removeLine,
  lineById,
  addTable,
  removeTable,
  tableById,
  setTableCell,
  setTableCellRuns,
  setTableCellStyle,
  mergeTableCells,
  unmergeTableCell,
  whiteboardObjectsInZOrder,
  rowHeightsOf,
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
  attachCanvas(store, state, history)
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
// The user's saved Parent/Child default node look (#260), so a freshly-dropped
// mind map's root and children are created in the chosen style. Falls back to the
// module default for an older stored settings object.
function mindmapStyles() {
  const nodeStyle = useAppSettings().settings.mindmapNodeStyle
  return {
    parent: nodeStyle?.parent || DEFAULT_NODE_STYLE,
    child: nodeStyle?.child || DEFAULT_NODE_STYLE,
  }
}

function commitStarter(store, state, history, label, submodels, view, origin = null) {
  const flat = flattenSubmodels(starterDocument(submodels), state.themePreset, mindmapStyles())
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
// Every node-text write shares this history label so the coalescer (same label,
// within 450ms, and it must start with "Update ") folds them into one step. Module
// scope because both the mind-map and the flowchart writers use it.
const NODE_TEXT_EDIT = 'Update node text'

function attachMindMap(store, state, history) {
  // Write a set of mind-map layout patches back onto the live shapes/connectors.
  // Shared by the auto-tidy on add (#273) and the explicit Tidy up; the caller runs
  // it INSIDE a commit() so the re-flow lands in the same undoable unit as the edit.
  // Sizes ride along with positions: the layout spaced the tree against boxes it
  // measured from each node's text, so the shapes must carry those same boxes or
  // the spacing describes a tree nobody can see (#427). A patch that matches what
  // the shape already holds is skipped, so an idempotent re-flow writes nothing —
  // no autosave churn, no phantom diff for a collaborator.
  const applyMindmapPatches = (patches) => {
    for (const patch of patches.nodes) {
      const shape = state.shapes.find((s) => s.id === patch.id)
      if (!shape) continue
      if (shape.x === patch.x && shape.y === patch.y && shape.w === patch.w && shape.h === patch.h) continue
      shape.x = patch.x
      shape.y = patch.y
      if (patch.w) shape.w = patch.w
      if (patch.h) shape.h = patch.h
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

  // Re-flow every DISTINCT tree the given nodes belong to, once each. reflowTree
  // settles a whole tree from any one member, so handing it N members of the same
  // tree is N identical re-flows; the component set of a tree already settled is what
  // makes it one. Must run inside the caller's commit().
  const reflowTreesOf = (memberIds) => {
    const settled = new Set()
    for (const memberId of memberIds || []) {
      if (settled.has(memberId)) continue
      const members = mindmapComponentIds(state.shapes, memberId)
      if (!members.size) continue
      for (const id of members) settled.add(id)
      reflowTree(memberId)
    }
  }

  // The nodes that stay behind when `ids` go: each departing mind-map node's parent,
  // where the parent is not itself on the way out. Read BEFORE the removal — a node
  // that is already gone can no longer name the tree it was in. A removed ROOT
  // contributes nothing, which is right: its whole tree left with it, so there is
  // nothing to close up.
  const survivorsOfRemoval = (ids) => {
    const removed = new Set(ids || [])
    const anchors = []
    for (const shape of state.shapes) {
      if (shape.role !== ROLE.mindmapNode || !removed.has(shape.id)) continue
      const parentId = shape.mindmap?.parentId
      if (parentId && !removed.has(parentId)) anchors.push(parentId)
    }
    return anchors
  }

  // Remove shapes and let any mind map they came from close back up (#513). Adding a
  // node shoves its siblings aside and re-flows (#273); deleting one has to be that
  // move in reverse, or a tree goes on holding space for nodes that are not in it.
  // Every delete path routes through here, so it does not matter whether a node left
  // by the mind-map Delete key or by a plain shape delete. Must run inside the
  // caller's commit(), so the delete and the settle are one undo step.
  store.removeShapesAndSettle = (ids) => {
    const anchors = survivorsOfRemoval(ids)
    removeShapesInternal(state, ids)
    reflowTreesOf(anchors)
  }

  // Densely renumber one parent's child shapes 0..n-1 by their current order (both
  // sides together — each side's relative order is preserved as a subsequence of the
  // global sort), keeping the order tags clean integers after a fractional insert.
  const renumberChildShapes = (parentShapeId) =>
    state.shapes
      .filter((s) => s.role === ROLE.mindmapNode && s.mindmap?.parentId === parentShapeId)
      .sort((a, b) => (a.mindmap?.order ?? 0) - (b.mindmap?.order ?? 0))
      .forEach((shape, i) => (shape.mindmap.order = i))

  // The user's saved Child-node default look (#260). Falls back to the module
  // default when an older stored settings object predates the setting.
  const childStyle = () => useAppSettings().settings.mindmapNodeStyle?.child || DEFAULT_NODE_STYLE

  // Add a child as a free-floating tagged shape + branch connector (free-floating
  // #122), one undoable unit. Used when the parent is a migrated mind-map SHAPE.
  const addChildShape = (parentShapeId, side) => {
    const built = buildMindmapChild(state.shapes, parentShapeId, state.themePreset, side, childStyle())
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
    const built = buildMindmapChild(state.shapes, parentShapeId, state.themePreset, side, childStyle())
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
      // A sibling is another child node, so honour the same Child default look (#260).
      const built = buildMindmapSibling(state.shapes, nodeId, state.themePreset, childStyle())
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
  // Re-fit mind-map nodes to their own labels and settle the trees they belong to.
  // The single answer to "this node's text changed, or the style it is set in did"
  // (#427) — used by the toolbar's font controls through updateShape(s) as well as
  // by the text editor. Must run inside a caller's commit(); ids that are not
  // mind-map nodes are skipped, so callers need not care what they are holding.
  store.fitMindmapNodes = (ids) => {
    const fitted = []
    for (const id of ids || []) {
      const shape = state.shapes.find((s) => s.id === id)
      if (!shape || shape.role !== ROLE.mindmapNode) continue
      applyPatch(shape, mindmapSizeForShape(shape))
      fitted.push(id)
    }
    reflowTreesOf(fitted)
  }

  // Resize a node to its label WHILE the label is being typed. It carries the same
  // history label as the commit below on purpose: history coalesces consecutive
  // commits that share a label, so a burst of typing plus the final commit collapse
  // into one undo step instead of leaving a step that holds the new box with the
  // old text (#427).
  store.resizeMindmapNodeToText = (id, size) =>
    history.commit(NODE_TEXT_EDIT, () => applyPatch(state.shapes.find((s) => s.id === id), size))
  // Land an edited label on a free-floating node: the text, the box that text
  // measures to, and the re-flow that box needs, as ONE undoable unit (#427).
  // Typing itself never re-flows — a tree that rearranged on every keystroke is
  // what made editing feel like fighting the layout — so the tree settles once,
  // here, when the editor closes.
  store.commitMindmapNodeText = (id, text) => {
    const shape = state.shapes.find((s) => s.id === id)
    if (!shape) return
    history.commit(NODE_TEXT_EDIT, () => {
      applyPatch(shape, { text })
      store.fitMindmapNodes([id])
    })
  }
  // Move a node to a new place in the tree by dropping it (#427 item 4). A mind map
  // is auto-laid-out, so a drag never sets coordinates: it rewrites the node's
  // parent / side / order tags, drags its subtree along, re-points the branch to
  // the new parent, and lets the layout place everything. All in ONE commit, so a
  // single undo puts the branch back exactly where it was.
  //
  // The branch connector keeps its id even though the id encodes the old parent: a
  // new id would read as a delete plus an insert to undo and to collaborators.
  store.moveMindmapNode = (nodeId, slot) => {
    const patches = dropPatches(state.shapes, nodeId, slot)
    if (!patches.nodes.length) return
    const oldParentId = state.shapes.find((s) => s.id === nodeId)?.mindmap?.parentId
    history.commit('Move node', () => {
      for (const { id, ...tags } of patches.nodes) {
        const shape = state.shapes.find((s) => s.id === id)
        if (shape) applyPatch(shape.mindmap, tags)
      }
      repointBranch(nodeId, slot.parentId)
      renumberChildShapes(oldParentId)
      renumberChildShapes(slot.parentId)
      reflowTree(slot.parentId)
      // A canvas can hold several maps (#48) and a node can be dropped into a
      // different one, which leaves a gap — and stale branch anchors — behind in
      // the map it came from. Re-flowing both settles the tree it left as well as
      // the tree it joined; on the usual same-tree move the second pass is a no-op.
      if (oldParentId) reflowTree(oldParentId)
    })
  }

  // Hang the node's branch connector off its new parent. Anchors are left to the
  // re-flow, which recomputes them from the settled boxes.
  const repointBranch = (nodeId, parentId) => {
    const branch = state.connectors.find(
      (c) => c.role === ROLE.mindmapBranch && c.to?.shapeId === nodeId,
    )
    if (!branch) return
    branch.from.shapeId = parentId
    if (branch.mindmap) branch.mindmap.parentId = parentId
  }
  // Delete migrated mind-map SHAPES and their whole subtrees (free-floating #122):
  // reconstruct the tree from the tags, expand each id to its descendants, then drop
  // those shapes and any connector touching them — one undoable unit, no dangling
  // branches. Ids that are not mind-map shapes expand to just themselves.
  store.deleteMindmapSubtrees = (ids) => {
    const model = mindmapModelFromShapes(state.shapes)
    const remove = new Set()
    for (const id of ids || []) for (const sid of subtreeIds(model, id)) remove.add(sid)
    if (!remove.size) return
    history.commit('Delete', () => store.removeShapesAndSettle([...remove]))
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
  // Sizing a flowchart node to its label (#441 items 5/14), the counterpart of
  // resizeMindmapNodeToText / commitMindmapNodeText in attachMindMap. The one
  // difference is that nothing re-flows on commit: a flowchart is manually placed,
  // so the neighbours of an edited node stay where the user put them (#441 item 18)
  // unless the growth actually crowds them.
  store.resizeFlowchartNodeToText = (id, size) =>
    history.commit(NODE_TEXT_EDIT, () => {
      applyPatch(state.shapes.find((s) => s.id === id), size)
      shiftCrowdedNeighbours(id)
    })
  store.commitFlowchartNodeText = (id, text) => {
    const shape = state.shapes.find((s) => s.id === id)
    if (!shape) return
    history.commit(NODE_TEXT_EDIT, () => {
      applyPatch(shape, { text, ...flowchartSizeForShape({ ...shape, text }) })
      shiftCrowdedNeighbours(id)
    })
  }
  // "This node's text changed, or the style it is set in did" for a flowchart node
  // — the counterpart of fitMindmapNodes, and the reason raising the font size now
  // grows the node (#441 round 2). Without it the letters grew inside a box that
  // stayed put, so a bigger label spilled out of the shape. Must run inside a
  // caller's commit(); ids that are not flowchart nodes are skipped. Nothing
  // re-flows: a flowchart is manually placed, so only this node's own box moves.
  store.fitFlowchartNodes = (ids) => {
    for (const id of ids || []) {
      const shape = state.shapes.find((s) => s.id === id)
      if (!shape || shape.role !== ROLE.flowchartNode) continue
      applyPatch(shape, flowchartSizeForShape(shape))
      shiftCrowdedNeighbours(id)
    }
  }
  // A node that grew to fit its label grows INTO its neighbours (#441 round 3), so
  // the ones it now crowds step aside to keep the gap they had. Only crowded nodes
  // move, and only far enough to clear: a flowchart is manually placed, so this must
  // never turn into a re-flow of the whole chart. Must run inside a caller's commit.
  const shiftCrowdedNeighbours = (anchorId) => {
    const nodes = state.shapes.filter((s) => s.role === ROLE.flowchartNode)
    if (nodes.length < 2) return
    const shifted = separateBoxes(
      nodes.map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h })),
      { anchorId },
    )
    for (const [id, position] of Object.entries(shifted)) {
      const shape = nodes.find((s) => s.id === id)
      if (shape) applyPatch(shape, position)
    }
  }
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
  // `port` targets a specific decision branch (the "+" that was pressed knows which
  // one it belongs to); null lets the op pick the next free branch as before.
  store.addFlowchartChildShape = (parentShapeId, nodeType, port = null, side = null) => {
    const built = buildFlowchartChild(state.shapes, state.connectors, parentShapeId, nodeType, port, side)
    if (!built) return null
    built.shape.zIndex = nextZIndex(state)
    const parent = state.shapes.find((s) => s.id === parentShapeId)
    history.commit('Add node', () => {
      // A decision that has run out of branches grows one (#441 item 15); it lands
      // in the same commit as the child so one undo takes back the whole add.
      if (built.parentPatch && parent) {
        parent.flowchart = { ...parent.flowchart, ...built.parentPatch }
      }
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
  // Swap a migrated flowchart SHAPE's node type in place (free-floating #122, spec
  // B7/B11), preserving its edges — the free-floating counterpart of swapNodeType,
  // which the toolbar's Node-type picker could not reach before (#410: it only ever
  // wrote to the empty legacy state.flowchart). Reconstructs the model so the
  // existing branch-aware swap logic runs unchanged, then writes back the swapped
  // node's shape plus its outgoing edges' ports (a decision leaving the type
  // re-homes its outgoing edges onto 'out'). An edge's on-canvas ROUTE never needs
  // patching here — ConnectorView recomputes each flowchart edge's anchor from the
  // shapes' current boxes on every render.
  store.swapFlowchartNodeType = (id, nodeType) => {
    const shape = state.shapes.find((s) => s.id === id && s.role === ROLE.flowchartNode)
    if (!shape) return
    const model = flowchartModelFromShapes(state.shapes, state.connectors)
    swapNodeType(model, id, nodeType)
    const node = flowchartNodeById(model, id)
    // swapNodeType is a no-op for an unknown node, an unknown type, or an unchanged
    // one. Reading the result back is what tells those apart, so an invalid type
    // can never be written onto the shape.
    if (node?.nodeType !== nodeType) return
    const ports = new Map(outgoingEdges(model, id).map((edge) => [edge.to.nodeId, edge.from.port]))
    history.commit('Swap node type', () => {
      shape.type = FLOWCHART_FALLBACK_TYPE[nodeType] || 'rectangle'
      shape.w = node.w
      shape.h = node.h
      shape.flowchart = {
        ...shape.flowchart,
        nodeType,
        branches: node.branches.map((branch) => ({ ...branch })),
      }
      for (const connector of state.connectors) {
        if (connector.role !== ROLE.flowchartEdge || connector.from?.shapeId !== id) continue
        const port = ports.get(connector.to?.shapeId)
        if (port) connector.flowchart = { ...connector.flowchart, fromPort: port }
      }
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
  // (insert-reflow, direction toggle) as one undoable unit (Part G6).
  store.updateFlowchartModel = (label, mutatorFn) => {
    if (!state.flowchart) return
    history.commit(label, () => mutatorFn(state.flowchart))
  }
  // The unified-canvas counterpart (#98): run a whole-graph layout action (the flow
  // direction flip) over the FREE-FLOATING flowchart shapes, the way
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
    // A dropped Terminal is a Start or an End depending on what is already on the
    // canvas (#441 round 2). The starter model is built empty and holds only this
    // one node, so the count has to come from the canvas's own shapes.
    const terminators = (state.shapes || []).filter(
      (shape) => shape.role === ROLE.flowchartNode && shape.flowchart?.nodeType === 'terminator',
    ).length
    const text = nodeType === 'terminator' ? terminatorText(terminators) : ''
    addFlowchartNode(flowchart, nodeType, text, 0, 0)
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
  // Land a formatted sticky edit: the marks, the plain text the runs carry, and the
  // height that text measures to, as ONE undoable unit (#501).
  store.setStickyRuns = (id, runs, height) =>
    history.commit('Update sticky', () => {
      const note = stickyNoteById(state.whiteboard || {}, id)
      if (!note) return
      setStickyRuns(note, runs)
      if (height) note.h = height
    })
  // Give a note's TEXT its own size / alignment / colour, or clear one with null so
  // it follows the default again (#501). The note's `color` stays its paper.
  store.setStickyTextStyle = (id, patch) =>
    history.commit('Sticky text style', () => {
      const note = stickyNoteById(state.whiteboard || {}, id)
      if (note) setStickyTextStyle(note, patch)
    })
  // Live, unrecorded growth while a note is being typed into (#416). The editor
  // grows the note line by line and commits the final text and height together, so
  // one undo takes back the whole edit instead of peeling off half-typed notes.
  store.growStickyNote = (id, height) => {
    const note = stickyNoteById(state.whiteboard || {}, id)
    if (note && height > note.h) note.h = height
  }
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
      if (shapeIds.length) store.removeShapesAndSettle(shapeIds)
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
  // Give one cell (or a range of them) its own colour / alignment / size, or clear
  // an override with null so the cell follows the table again (#508). One commit for
  // the whole range, so restyling a selection takes one undo.
  store.setTableCellStyle = (id, cells, patch) =>
    history.commit('Cell style', () => {
      const table = tableById(state.whiteboard || {}, id)
      if (!table) return
      for (const { row, col } of cells) setTableCellStyle(table, row, col, patch)
    })
  // `rowHeight` is optional: when given (a cell that grew while it was typed
  // into, #556), the final size lands in the SAME commit as the text, so one
  // undo takes back both — mirrors setStickyRuns(id, runs, height).
  store.setTableCellRuns = (id, row, col, runs, rowHeight) =>
    history.commit('Edit cell', () => {
      const table = tableById(state.whiteboard || {}, id)
      if (!table) return
      setTableCellRuns(table, row, col, runs)
      if (rowHeight) {
        const heights = rowHeightsOf(table)
        heights[row] = Math.max(heights[row], rowHeight)
        table.rowHeights = heights
      }
    })
  // One undo step for a format applied across a cell range (#344) — undoing
  // "Bold" must put every cell back, not just the last one touched.
  store.formatTableCells = (id, cells, format) =>
    history.commit('Format cells', () => {
      const table = tableById(state.whiteboard || {}, id)
      if (!table) return
      for (const cell of cells) setTableCellRuns(table, cell.row, cell.col, format(cell))
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
  // Structural edits (#553). Each is one undoable step, and each goes through
  // tableStructure so the cell text, its runs, its styles, the merges and any
  // dragged sizes move together — the store never reshapes a grid by hand.
  store.insertTableRow = (id, at) =>
    commitOnTable(state, history, 'Insert row', id, (table) => insertTableRow(table, at))
  // A range delete is ONE undo step, so putting three deleted rows back takes one
  // undo rather than three. Bottom-up, so each removal leaves the rows still to go
  // at the index they were named by.
  store.deleteTableRows = (id, rows) =>
    commitOnTable(state, history, 'Delete rows', id, (table) => {
      for (const row of [...rows].sort((a, b) => b - a)) deleteTableRow(table, row)
    })
  store.insertTableColumn = (id, at) =>
    commitOnTable(state, history, 'Insert column', id, (table) => insertTableColumn(table, at))
  store.deleteTableColumns = (id, cols) =>
    commitOnTable(state, history, 'Delete columns', id, (table) => {
      for (const col of [...cols].sort((a, b) => b - a)) deleteTableColumn(table, col)
    })
  store.setTableHeaderRows = (id, count) =>
    commitOnTable(state, history, 'Header row', id, (table) => setTableHeaderRows(table, count))
  store.toggleTableHeaderThroughRow = (id, row) =>
    commitOnTable(state, history, 'Header row', id, (table) => toggleHeaderThroughRow(table, row))
  store.setTableHeaderCols = (id, count) =>
    commitOnTable(state, history, 'Header column', id, (table) => setTableHeaderCols(table, count))
  store.toggleTableHeaderThroughColumn = (id, col) =>
    commitOnTable(state, history, 'Header column', id, (table) => toggleHeaderThroughColumn(table, col))
  store.clearTableCells = (id, cells) =>
    commitOnTable(state, history, 'Clear cells', id, (table) => clearTableCells(table, cells))
  // Live, unrecorded growth while a cell is being typed into (#556) — same
  // contract as growStickyNote: growth-only, and never its own undo step. The
  // final height lands with the text in ONE commit via setTableCellRuns's
  // optional 5th argument.
  store.growTableRow = (id, row, height) => {
    const table = tableById(state.whiteboard || {}, id)
    if (!table) return
    const heights = rowHeightsOf(table)
    if (height > heights[row]) {
      heights[row] = height
      table.rowHeights = heights
    }
  }
  // Double-click a resize handle to fit that column/row to its content (#12),
  // reusing the same undo labels a manual drag already uses.
  store.autoFitTableColumn = (id, col) =>
    commitOnTable(state, history, 'Resize column', id, (table) => autoFitColumnWidth(table, col))
  store.autoFitTableRow = (id, row) =>
    commitOnTable(state, history, 'Resize row', id, (table) => autoFitRowHeight(table, row))
  store.removeTable = (id) => {
    if (!state.whiteboard) return
    history.commit('Delete table', () => removeTable(state.whiteboard, id))
  }
}

// Run one edit on a table inside a single history commit — every structural
// action above is otherwise the same three lines.
function commitOnTable(state, history, label, id, edit) {
  history.commit(label, () => {
    const table = tableById(state.whiteboard || {}, id)
    if (table) edit(table)
  })
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

// Shapes, authored connectors and whiteboard objects share one stacking scale
// (#27, #542), so "on top" means above EVERY pool — otherwise an image added
// after a freehand stroke still lands underneath it.
//
// Read the max off stackedObjects, the same pool repackZIndex renumbers. Read it
// off the shapes alone and a new object TIES with a connector the user just sent
// to the front: repack renumbers both together, so the connector holds the top
// index and the highest SHAPE index is one below it. The tie is the real bug —
// the two renderers break one in opposite directions (DiagramCanvas lists
// connectors first, WhiteboardLayer lists shapes first), so the same document
// stacked one way in block mode and the other on the unified canvas.
function nextZIndex(state) {
  return stackedObjects(state).reduce((max, { object }) => Math.max(max, object.zIndex || 0), 0) + 1
}

// Every object that carries a zIndex, as a flat list — the pool the Arrange
// actions reorder and the renderers paint in order.
// Structural connectors (mind-map branches/cross-links, flowchart edges) are
// excluded: they are rebuilt or re-routed from their owning nodes and have no
// independent stack position of their own (#542, mirrors isMarqueeSelectable).
function stackedObjects(state) {
  return [
    ...state.shapes.map((shape) => ({ id: shape.id, object: shape })),
    ...state.connectors.filter(isAuthoredConnector).map((connector) => ({ id: connector.id, object: connector })),
    ...whiteboardObjectsInZOrder(state.whiteboard || {}),
  ]
}

function attachShapeMutations(store, state, history) {
  // Empty the whole canvas, whatever it holds (#462). Block shapes and their
  // connectors, sections, whiteboard ink, sticky notes, lines and tables, and the
  // legacy mind-map / flowchart sub-models all go.
  //
  // ONE commit, so undo brings the whole canvas back in a single step rather than
  // unpicking it object by object. That is the whole reason this lives in the store
  // instead of the menu calling four removers in a row.
  //
  // The sub-models are RESET, not set to null. A legacy single-type document keeps
  // its type, so a cleared mind map is an empty mind map — set to null, its own
  // toolbar and layer would have no model to read. On a unified document they are
  // already null and its mind-map and flowchart nodes are free-floating SHAPES,
  // which the first line covers.
  store.clearCanvas = () =>
    history.commit('Clear all', () => {
      state.shapes = []
      state.connectors = []
      state.sections = []
      state.selection = []
      if (state.whiteboard) {
        state.whiteboard = createWhiteboard(state.whiteboard.sketchStyle)
      }
      if (state.mindmap) {
        state.mindmap = { ...state.mindmap, nodes: [], rootId: null, crosslinks: [] }
      }
      if (state.flowchart) {
        state.flowchart = { ...state.flowchart, nodes: [], edges: [] }
      }
    })

  store.addShape = (partial) => {
    const shape = createShape({ zIndex: nextZIndex(state), ...partial }, state.themePreset)
    history.commit('Add shape', () => state.shapes.push(shape))
    return shape.id
  }
  // Drop an already-uploaded image, centred on `at` (canvas units) or on the canvas
  // centre. `image` is `{ src, w, h }`, measured and capped by useImageInsert before
  // it gets here. It is a store op rather than a helper beside the uploader so that
  // the click-to-place path (#503) can drop one without the canvas pulling in the
  // upload and toast machinery.
  store.insertImage = (image, at = null) => {
    const canvas = state.canvas
    const cx = at?.x ?? (canvas.width || 1280) / 2
    const cy = at?.y ?? (canvas.height || 720) / 2
    const id = store.addShape({
      type: 'image',
      src: image.src,
      x: Math.round(cx - image.w / 2),
      y: Math.round(cy - image.h / 2),
      w: image.w,
      h: image.h,
    })
    store.select(id)
    return id
  }
  // A mind-map node's box is derived from its label, so any patch that touches the
  // text — the words OR the style they are set in — has to re-fit the box in the
  // same commit (#427). Without this, raising the font size grew the letters inside
  // a box that stayed put, and the node only snapped to its real size later, when
  // something else happened to re-measure it.
  store.updateShape = (id, patch) =>
    history.commit('Update shape', () => {
      applyPatch(store.shapeById(id), patch)
      if (patch.text) {
        store.fitMindmapNodes?.([id])
        store.fitFlowchartNodes?.([id])
      }
    })
  store.updateShapes = (ids, patch) =>
    history.commit('Update shapes', () => {
      ids.forEach((id) => applyPatch(store.shapeById(id), patch))
      if (patch.text) {
        store.fitMindmapNodes?.(ids)
        store.fitFlowchartNodes?.(ids)
      }
    })
  store.removeShapes = (ids) =>
    history.commit('Delete shapes', () => store.removeShapesAndSettle(ids))
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
    if (shapeIds.length) store.removeShapesAndSettle(shapeIds)
    if (connectorIds.length) removeConnectorsInternal(state, connectorIds)
  })
}

// Duplicate shapes (+10/+10); copy connectors only if both endpoints duplicated.
function duplicateInternal(store, state, history, ids) {
  const newIds = []
  history.commit('Duplicate', () => {
    const idMap = duplicateShapes(store, state, ids, newIds)
    duplicateConnectors(state, ids, idMap, newIds)
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

// Duplicate a connector when it was itself selected (#542 — a lone authored
// line, Cmd+D), OR when BOTH its endpoints are attached to shapes being
// duplicated, so a connected pair carries its line along even though the line
// was never clicked (e.g. selecting two linked shapes with a marquee, which
// does not also catch every edge between them). Structural connectors carry
// along the same way — an untouched flowchart edge between two duplicated
// nodes must still connect the copies — but are never duplicated by explicit
// selection, since they cannot normally BE selected on their own via the tools
// that call this (isMarqueeSelectable already excludes them; #542).
//
// A FREE endpoint never counts as "attached": before this it trivially passed
// (`!endpoint.shapeId` is true for any unattached end), so any free-floating
// line anywhere in the document silently got redrawn beside its original the
// moment the user duplicated anything else. Remapping falls back to the
// original shapeId when that shape wasn't part of the duplicated set — safe
// here (unlike paste's cross-context copy) because the original shape is still
// live in the same document.
function duplicateConnectors(state, ids, idMap, newIds) {
  for (const c of state.connectors) {
    const selected = isAuthoredConnector(c) && ids.includes(c.id)
    const carried = endpointAttached(c.from, ids) && endpointAttached(c.to, ids)
    if (!selected && !carried) continue
    const copy = createConnector({ ...clone(c), id: undefined })
    copy.from = remapDuplicatedEndpoint(c.from, idMap)
    copy.to = remapDuplicatedEndpoint(c.to, idMap)
    state.connectors.push(copy)
    newIds.push(copy.id)
  }
}

function endpointAttached(endpoint, ids) {
  return Boolean(endpoint?.shapeId) && ids.includes(endpoint.shapeId)
}

function remapDuplicatedEndpoint(endpoint, idMap) {
  if (endpoint?.shapeId) return { ...endpoint, shapeId: idMap[endpoint.shapeId] || endpoint.shapeId }
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
  // Mirrors updateShapes: a multi-connector patch (e.g. LinkSection setting one
  // link across a marquee-selected set) is one undo step, not one per connector.
  store.updateConnectors = (ids, patch) =>
    history.commit('Update connectors', () => ids.forEach((id) => applyPatch(store.connectorById(id), patch)))
}

function attachSelection(store, state) {
  // Selecting a shape drops any whiteboard-object selection, and vice versa (#416,
  // the mirror of the rule in useWhiteboardUi's setSelection). The two selections
  // are separate arrays, so without this both stayed filled: the toolbar followed
  // the whiteboard one, and a colour meant for the shape under the cursor went to
  // the sticky selected three clicks ago. Select All is the one caller that wants
  // both, and it assigns state.selection directly rather than coming through here.
  const takeSelection = () => {
    if (state.selection.length) useWhiteboardUi().clearSelection()
  }

  store.select = (ids) => {
    state.selection = Array.isArray(ids) ? [...ids] : [ids]
    takeSelection()
  }
  store.addToSelection = (ids) => {
    const next = Array.isArray(ids) ? ids : [ids]
    state.selection = [...new Set([...state.selection, ...next])]
    takeSelection()
  }
  store.toggleInSelection = (id) => {
    state.selection = state.selection.includes(id)
      ? state.selection.filter((existing) => existing !== id)
      : [...state.selection, id]
    takeSelection()
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
      useWhiteboardUi().setSelection(all, { keepShapes: true })
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
  // (s.zIndex || 0): a connector newly eligible for Arrange (#542) has never
  // carried a zIndex before, unlike a shape or whiteboard object, which always
  // gets one on creation — read raw here and the arithmetic goes to NaN.
  store.bringForward = (ids) => reorder(state, history, 'Forward', ids, (s) => (s.zIndex || 0) + 1.5)
  store.sendBackward = (ids) => reorder(state, history, 'Backward', ids, (s) => (s.zIndex || 0) - 1.5)
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

// state.themePreset is still read all over (canvas data-fdpreset, the flowchart
// and mind-map layers, thumbnails) and Settings' defaultThemePreset seeds it for
// a new diagram — but no mutator switches an existing diagram's preset any more,
// so nothing here re-paints shapes to a new triad (#397).
function attachCanvas(store, state, history) {
  store.setCanvas = (patch) => history.commit('Canvas', () => Object.assign(state.canvas, patch))
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
