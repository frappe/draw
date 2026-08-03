// Diagram JSON schema — the single source of truth for a diagram document.
// Spec §11.3. Every diagram's `document` field holds an object of this shape.
// Bump SCHEMA_VERSION and add a migration whenever the shape changes; theme
// presets, hover-arrows, and future diagram types all build on this.

import { DEFAULT_PRESET_NAME, findPreset } from './canvasPresets.js'
import { createEmptyMindMap } from './mindmapModel.js'
import { createFlowchart } from './flowchartModel.js'
import { createWhiteboard, WHITEBOARD_KINDS } from './whiteboardModel.js'
import { flattenSubmodels } from './freeFloating.js'

// v2 (free-floating, #122): the unified canvas no longer keeps mind-map/flowchart
// as framed sub-models — they flatten into the shared shapes[]/connectors[] on
// load. v1 docs migrate lazily on first open. See freeFloating.js.
export const SCHEMA_VERSION = 2

// The diagram type selects the active mode module (spec diagram-types §0).
// `block` is the original editor; the others are layered on the same engine.
export const DEFAULT_DIAGRAM_TYPE = 'block'
export const DIAGRAM_TYPES = ['block', 'mindmap', 'flowchart', 'whiteboard']

// The unified canvas (roadmap: canvas unification). A `unified` document is not
// locked to one type — it carries the shared block substrate AND all three
// sub-models (mind map / flowchart / whiteboard) initialised empty, so any tool
// works on the same canvas. Legacy single-type documents are untouched and keep
// rendering via their original path (back-compat). Phase 1 = data model only;
// rendering/interaction/menu unification land in later phases.
export const UNIFIED_DIAGRAM_TYPE = 'unified'

// True when a document uses the unified canvas rather than a single locked type.
export function isUnifiedDocument(document) {
  return document?.diagramType === UNIFIED_DIAGRAM_TYPE
}

// Canvas background "no color" renders white in the editor but exports
// transparent (spec §4.1). Null is the sentinel for "no color".
const NO_COLOR = null

export function createDiagramDocument(presetName = DEFAULT_PRESET_NAME, diagramType = DEFAULT_DIAGRAM_TYPE) {
  const preset = findPreset(presetName)
  const document = {
    schemaVersion: SCHEMA_VERSION,
    diagramType,
    canvas: {
      sizePreset: preset.name,
      width: preset.width,
      height: preset.height,
      background: NO_COLOR,
    },
    shapes: [],
    connectors: [],
    // Named sections/frames that group content (spec: available in every type).
    sections: [],
    // Per-type sub-objects. A single-type doc populates only its own; a unified
    // doc populates ALL of them (empty) so any tool works on one canvas. The
    // canvas always starts fully blank — a mind map begins with NO root node.
    mindmap: usesSubModel('mindmap', diagramType) ? createEmptyMindMap() : null,
    flowchart: usesSubModel('flowchart', diagramType) ? createFlowchart() : null,
    whiteboard: usesSubModel('whiteboard', diagramType) ? createWhiteboard() : null,
  }
  // A unified canvas holds every frame at once, so seed distinct frame origins —
  // otherwise the mind map and flowchart both default to (0,0) and land stacked
  // when inserted. They stay freely movable afterwards.
  if (diagramType === UNIFIED_DIAGRAM_TYPE) applyUnifiedFrameOrigins(document)
  return document
}

// The default spatial layout of a fresh unified canvas: mind map upper-centre,
// flowchart well below it, both clear of the block substrate around (0,0).
function applyUnifiedFrameOrigins(document) {
  if (document.mindmap) document.mindmap.origin = { x: 600, y: 200 }
  if (document.flowchart) document.flowchart.origin = { x: 600, y: 700 }
  return document
}

// Whether a document of `diagramType` should carry the given sub-model: its own
// type, or ALL of them when unified.
function usesSubModel(subModel, diagramType) {
  return diagramType === subModel || diagramType === UNIFIED_DIAGRAM_TYPE
}

// Create a blank unified-canvas document (shared substrate + all sub-models).
// createDiagramDocument already seeds the distinct frame origins for a unified
// type; this stays as a named, intent-revealing entry point.
export function createUnifiedDocument(presetName = DEFAULT_PRESET_NAME) {
  return createDiagramDocument(presetName, UNIFIED_DIAGRAM_TYPE)
}

// Parse a document that may arrive as a JSON string (from the API) or an object,
// running it through migrations so callers always get the current schema.
export function parseDiagramDocument(raw) {
  const document = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!document || !document.canvas) return createDiagramDocument()
  return migrateDocument(document)
}

// Existing v1 documents have no diagramType — default them to `block`
// (Part G3 backward-compat: read-time fallback).
function migrateDocument(document) {
  if (!document.diagramType) document.diagramType = DEFAULT_DIAGRAM_TYPE
  if (!Array.isArray(document.sections)) document.sections = []
  if (document.mindmap === undefined) document.mindmap = null
  if (document.flowchart === undefined) document.flowchart = null
  if (document.whiteboard === undefined) document.whiteboard = null

  // Free-floating (#122, v2): on the unified canvas, flatten the framed mind-map
  // / flowchart sub-models into the shared shapes[]/connectors[] — every node
  // becomes an ordinary canvas object (tagged with its role). Lazy (on load) +
  // idempotent (already-empty sub-models are a no-op, so a re-migrated doc is
  // unchanged). Legacy single-type mind-map/flowchart docs are deliberately LEFT
  // on their original render path: their block layer is hidden (they render their
  // own layer), so flattening would blank the canvas. flattenSubmodels returns a
  // new doc; `migrated` points at it.
  const migrated = isUnifiedDocument(document)
    ? flattenSubmodels(document, document.themePreset)
    : document

  // A unified document must carry every sub-model — the flatten nulls them, and a
  // doc saved before a sub-model existed lacks it; interaction/collab still probe
  // for them until later phases, so keep empty ones present.
  if (isUnifiedDocument(migrated)) {
    if (!migrated.mindmap) migrated.mindmap = createEmptyMindMap()
    if (!migrated.flowchart) migrated.flowchart = createFlowchart()
    if (!migrated.whiteboard) migrated.whiteboard = createWhiteboard()
    // Backfill frame origins on docs saved before the frame model existed.
    if (!migrated.mindmap.origin) migrated.mindmap.origin = { x: 0, y: 0 }
    if (!migrated.flowchart.origin) migrated.flowchart.origin = { x: 0, y: 0 }
  }
  backfillWhiteboardZIndex(migrated)
  backfillMindmapShaped(migrated)
  migrated.schemaVersion = SCHEMA_VERSION
  return migrated
}

// Whiteboard objects gained a zIndex when stacking became document-wide (#27).
// Documents saved before that painted them in a fixed order — always above the
// shared shapes[], strokes then lines then tables then stickies — so hand them
// zIndexes in exactly that order and existing boards keep rendering as they did.
//
// UNASSIGNED_Z is the whole point of the pass: the store allocates from the top
// of the stack, so a live zIndex is always >= 1, and both an object saved before
// the field existed and one built straight off a model factory read as 0. Those
// are exactly the objects that need a place in the stack — an object left at 0
// would paint under every shape, which is the bug this fixes, not a position
// anyone chose.
const UNASSIGNED_Z = 0
const WB_LIST_KEY = { stroke: 'strokes', line: 'lines', table: 'tables', sticky: 'stickyNotes' }

function backfillWhiteboardZIndex(document) {
  const model = document.whiteboard
  if (!model) return
  let z = (document.shapes || []).reduce((max, shape) => Math.max(max, shape.zIndex || 0), 0)
  for (const kind of WHITEBOARD_KINDS) {
    for (const object of model[WB_LIST_KEY[kind]] || []) {
      if ((object.zIndex || UNASSIGNED_Z) > UNASSIGNED_Z) z = Math.max(z, object.zIndex)
      else object.zIndex = (z += 1)
    }
  }
}

// Mind-map nodes gained a `mindmap.shaped` flag with the Whimsical style (#125):
// the root renders as a box, children as transparent text. Documents flattened
// before the flag existed lack it, so backfill from isRoot — root→boxed,
// children→text. Idempotent (a node that already carries the flag is left alone),
// so re-running is stable and no SCHEMA_VERSION bump is needed.
function backfillMindmapShaped(document) {
  for (const shape of document.shapes || []) {
    if (shape.role !== 'mindmap-node' || !shape.mindmap) continue
    if (shape.mindmap.shaped === undefined) shape.mindmap.shaped = !!shape.mindmap.isRoot
  }
}
