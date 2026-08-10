// Free-floating migration engine (issue #122, phase 1).
//
// The mind map and flowchart currently live as FRAMED sub-models on the document
// (`document.mindmap` / `document.flowchart`), each with its own node/edge lists
// and a frame `origin`. That second coordinate space + special-cased node
// handling is the source of a whole class of interaction bugs (#96/#100/#120/#121)
// and clobbers on concurrent edits (the sub-models sit in one coarse `meta` blob).
//
// The target model dissolves the frames: every mind-map / flowchart NODE becomes
// an ordinary canvas shape in `shapes[]` (tagged with a `role` so we still know
// what it is), and every LINK becomes an ordinary connector in `connectors[]`
// (endpoints bound to the shapes by id, exactly like the #138 anchor system).
// Positions are baked into canvas coordinates so there is no origin left to
// convert. Once flattened, selection / marquee / drag / delete / text-edit all
// come free from the shared shape machinery.
//
// THIS MODULE IS THE PURE, DETERMINISTIC CONVERTER ONLY. Phase 1 lands it fully
// unit-tested but does NOT wire it into the live load/render/save path — the
// renderer cannot yet draw tagged flowchart glyphs, so activating it now would be
// a visible change. Phase 2 flips the switch (schema bump + render + interaction)
// on top of this proven core. Keeping the engine separable is what lets phase 1
// be genuinely no-visible-change while still being real, reviewable progress.

import { nodeById } from './mindmapModel.js'
import { layoutMindMap, offsetPositions } from './mindmapLayout.js'
import { DEFAULT_NODE_STYLE, nodeColors, borderProp, connectorColor } from './mindmapNodeStyle.js'
import { nodeSize } from './flowchartModel.js'
import { nodeClickZone } from './mindmapNodeShape.js'

// The schema version that first emits free-floating documents. Phase 1 keeps the
// live SCHEMA_VERSION at 1 (see schema.js) — this constant is the target phase 2
// adopts when it wires the migration into `migrateDocument`.
export const SCHEMA_VERSION_FREEFLOATING = 2

// `role` tags on migrated objects. A shape/connector with no role is a plain
// block object (unchanged). These let the renderer and interaction layers keep
// treating mind-map / flowchart objects specially where geometry demands it
// (glyphs, branch colour, orthogonal routing) while they live in the shared
// arrays.
export const ROLE = {
  mindmapNode: 'mindmap-node',
  mindmapBranch: 'mindmap-branch',
  mindmapCrosslink: 'mindmap-crosslink',
  flowchartNode: 'flowchart-node',
  flowchartEdge: 'flowchart-edge',
}

export function isMindmapShape(shape) {
  return shape?.role === ROLE.mindmapNode
}

// What a single click at logical `point` on `shape` should do on the unified
// canvas (#123). A mind-map node edits its text when the click is over the label
// interior and selects when it lands on the border rim; every other shape returns
// null, so the canvas keeps its normal select / double-click-to-edit. Pure (the
// zone maths lives in nodeClickZone) so the zone→action decision unit-tests
// without a live pointer. `point` and `shape` share logical canvas coordinates.
export function mindmapNodeClickAction(shape, point) {
  if (!isMindmapShape(shape)) return null
  return nodeClickZone(point.x - shape.x, point.y - shape.y, shape)
}

export function isFlowchartShape(shape) {
  return shape?.role === ROLE.flowchartNode
}

// Flowchart node types that ShapeView cannot draw yet get a nearest-neighbour
// fallback `type`, so a migrated shape is renderable even before phase 2 teaches
// the renderer the real glyph. The authoritative shape stays in
// `shape.flowchart.nodeType`; this is only the degrade path.
export const FLOWCHART_FALLBACK_TYPE = {
  terminator: 'rounded',
  process: 'rounded',
  decision: 'diamond',
  inputOutput: 'rectangle',
  document: 'rectangle',
  database: 'cylinder',
  predefinedProcess: 'rectangle',
  manualInput: 'rectangle',
  preparation: 'hexagon',
  offPageRef: 'pentagon',
  connector: 'ellipse',
}

const NEUTRAL_BORDER = { color: '#525252', width: 1.5, dash: 'solid' }

// A private JSON clone — the migration must never mutate the source document (it
// runs on a live in-memory doc during load). structuredClone is not guaranteed in
// every test/runtime, and the models are plain JSON, so this is enough.
function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function textBlock(content, color, align = 'center') {
  return {
    content: content || '',
    align,
    valign: 'middle',
    style: { size: 16, bold: false, italic: false, underline: false, color },
  }
}

// The parent/child default node look applied when flattening (#260). Monochrome
// gray for both unless a caller (the store, reading the user's settings) overrides.
const DEFAULT_STYLES = { parent: DEFAULT_NODE_STYLE, child: DEFAULT_NODE_STYLE }

// --- mind map ---------------------------------------------------------------

// Bake absolute canvas positions for EVERY node, ignoring collapse. Free-floating
// has no collapse concept (every object is always visible; folding becomes an
// explicit action in a later phase), so a collapsed subtree must still get real
// positions or its nodes would migrate stacked on top of each other. We lay the
// tree out fully expanded, then shift by the frame origin. The original
// `collapsed` flag is preserved in each node's tag for a future fold action.
function bakeMindmapPositions(model) {
  const expanded = clone(model)
  for (const node of expanded.nodes) node.collapsed = false
  const laid = layoutMindMap(expanded)
  return offsetPositions(laid.positions, model.origin)
}

// The anchor pair for a parent→child branch, derived from the baked geometry:
// the child leaves whichever side of the parent it sits on. Layout-driven rather
// than reading node.side, so it is correct for every tree shape.
function branchAnchors(parentBox, childBox) {
  const parentCenter = parentBox.x + parentBox.w / 2
  const childCenter = childBox.x + childBox.w / 2
  return childCenter >= parentCenter
    ? { from: 'right', to: 'left' }
    : { from: 'left', to: 'right' }
}

// Convert a mind-map sub-model into tagged shapes + connectors. Node ids are
// reused verbatim as shape ids (they are globally unique, prefix 'n…') so
// connectors and any future references keep pointing at the same objects.
function flattenMindmap(model, themePreset, startZ, styles = DEFAULT_STYLES) {
  const shapes = []
  const connectors = []
  if (!model || !model.nodes?.length) return { shapes, connectors, nextZ: startZ }

  const boxes = bakeMindmapPositions(model)
  let z = startZ

  // One shape per node. A node with no baked box (should not happen once fully
  // expanded, but stays defensive) is skipped for geometry yet still recorded at
  // its parent's spot so nothing is silently lost.
  for (const node of model.nodes) {
    const box = boxes[node.id]
    const isRoot = !node.parentId
    // #260 reverses #125: every node defaults to the same monochrome gray box (the
    // parent and child looks come from settings). An explicit per-node colour
    // (node.color) still wins for the border; colour is otherwise opt-in (#274).
    const style = isRoot ? styles.parent : styles.child
    const colors = nodeColors(style, node.color || null)
    z += 1
    shapes.push({
      id: node.id,
      type: 'rounded',
      x: Math.round(box?.x ?? 0),
      y: Math.round(box?.y ?? 0),
      w: Math.round(box?.w ?? 160),
      h: Math.round(box?.h ?? 48),
      rotation: 0,
      opacity: 1,
      zIndex: z,
      fill: colors.fill,
      border: borderProp(colors.border, isRoot ? 2 : 1.5),
      text: textBlock(node.text, colors.ink, style.align),
      role: ROLE.mindmapNode,
      mindmap: {
        parentId: node.parentId || null,
        order: node.order,
        depth: node.depth,
        collapsed: !!node.collapsed,
        side: node.side || null,
        color: node.color || null,
        curve: style.curve,
        marker: node.marker || { icon: null, colorDot: null },
        isRoot,
        shaped: colors.shaped,
      },
    })
  }

  // Parent→child edges become curved connectors bound to the two shapes.
  for (const node of model.nodes) {
    if (!node.parentId) continue
    const parentBox = boxes[node.parentId]
    const childBox = boxes[node.id]
    const anchors =
      parentBox && childBox ? branchAnchors(parentBox, childBox) : { from: 'right', to: 'left' }
    connectors.push({
      id: `mmb-${node.parentId}-${node.id}`,
      type: 'curved',
      from: { shapeId: node.parentId, anchor: anchors.from },
      to: { shapeId: node.id, anchor: anchors.to },
      arrowheads: { start: 'none', end: 'none' },
      style: { color: connectorColor(node.color || null), width: 2, dash: 'solid' },
      label: '',
      role: ROLE.mindmapBranch,
      mindmap: { parentId: node.parentId, childId: node.id },
    })
  }

  // Cross-links (non-tree dotted associations, #… mind-map cross-link) become
  // dashed connectors carrying their label.
  for (const link of model.crosslinks || []) {
    if (!nodeById(model, link.fromId) || !nodeById(model, link.toId)) continue
    connectors.push({
      id: `mmx-${link.id}`,
      type: 'curved',
      from: { shapeId: link.fromId, anchor: 'right' },
      to: { shapeId: link.toId, anchor: 'left' },
      arrowheads: { start: 'none', end: 'arrow' },
      style: { color: '#8A8A8A', width: 1.5, dash: 'dashed' },
      label: link.label || '',
      role: ROLE.mindmapCrosslink,
      mindmap: { crosslinkId: link.id },
    })
  }

  return { shapes, connectors, nextZ: z }
}

// --- flowchart --------------------------------------------------------------

// Which side of a node an edge should leave / enter, from the two node centres.
// Flowchart edges route orthogonally, so we pick the dominant axis: mostly-below
// → bottom/top, mostly-right → right/left. The exact port is preserved in the
// connector tag for phase-2 routing; this only seeds a sensible anchor.
export function edgeAnchors(fromBox, toBox) {
  const dx = toBox.x + toBox.w / 2 - (fromBox.x + fromBox.w / 2)
  const dy = toBox.y + toBox.h / 2 - (fromBox.y + fromBox.h / 2)
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' }
  }
  return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' }
}

// Build a tagged flowchart-node shape for a flowchart node at an absolute box.
// Shared by the migration (flattenFlowchart) and the free-floating add-node op
// (freeFloatingOps.buildFlowchartChild) so a node created on the flattened canvas
// is byte-identical to a migrated one. The caller assigns zIndex.
export function flowchartNodeShape(node, box) {
  return {
    id: node.id,
    type: FLOWCHART_FALLBACK_TYPE[node.nodeType] || 'rectangle',
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.w),
    h: Math.round(box.h),
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: node.fill || 'none',
    border: node.border || { ...NEUTRAL_BORDER },
    text: textBlock(node.text, '#1F2933'),
    role: ROLE.flowchartNode,
    flowchart: {
      nodeType: node.nodeType,
      branches: clone(node.branches || []),
      manuallyPositioned: !!node.manuallyPositioned,
    },
  }
}

// Build a tagged flowchart-edge connector between two shapes, bound by shape id +
// anchor (the #138 anchor system). Shared by the migration and the add-node op so
// a created edge matches a migrated one; the caller supplies a unique id.
export function flowchartEdgeConnector(id, fromId, toId, anchors, { fromPort = 'out', toPort = 'in', kind = 'flow', label = '' } = {}) {
  return {
    id,
    type: 'elbow',
    from: { shapeId: fromId, anchor: anchors.from },
    to: { shapeId: toId, anchor: anchors.to },
    arrowheads: { start: 'none', end: 'arrow' },
    style: { color: '#525252', width: 1.5, dash: 'solid' },
    label,
    role: ROLE.flowchartEdge,
    flowchart: { fromPort, toPort, kind },
  }
}

// Convert a flowchart sub-model into tagged shapes + connectors. Flowchart nodes
// already store x/y (manual placement is allowed), so positions are simply
// shifted by the frame origin — no layout run needed. Node ids ('f…') are reused
// as shape ids; edge ports/kind/label are preserved so decision branches survive.
function flattenFlowchart(model, startZ) {
  const shapes = []
  const connectors = []
  if (!model || !model.nodes?.length) return { shapes, connectors, nextZ: startZ }

  const ox = Number.isFinite(model.origin?.x) ? model.origin.x : 0
  const oy = Number.isFinite(model.origin?.y) ? model.origin.y : 0
  const boxes = {}
  let z = startZ

  for (const node of model.nodes) {
    const size = nodeSize(node)
    const box = { x: node.x + ox, y: node.y + oy, w: size.w, h: size.h }
    boxes[node.id] = box
    z += 1
    const shape = flowchartNodeShape(node, box)
    shape.zIndex = z
    shapes.push(shape)
  }

  for (const edge of model.edges || []) {
    const fromBox = boxes[edge.from?.nodeId]
    const toBox = boxes[edge.to?.nodeId]
    if (!fromBox || !toBox) continue // no dangling routes (spec B11)
    const anchors = edgeAnchors(fromBox, toBox)
    connectors.push(
      flowchartEdgeConnector(`fce-${edge.id}`, edge.from.nodeId, edge.to.nodeId, anchors, {
        fromPort: edge.from?.port || 'out',
        toPort: edge.to?.port || 'in',
        kind: edge.kind || 'flow',
        label: edge.label || '',
      }),
    )
  }

  return { shapes, connectors, nextZ: z }
}

// --- document-level migration ----------------------------------------------

// The current top of the shape stack, so migrated nodes paint above existing
// block shapes rather than under them.
function topZ(shapes) {
  return (shapes || []).reduce((max, shape) => Math.max(max, shape.zIndex || 0), 0)
}

// Flatten a document's mind-map and flowchart sub-models into the shared
// `shapes[]` / `connectors[]` arrays and drop the sub-models. Returns a NEW
// document (the input is never mutated); idempotent on an already-flattened doc
// (no sub-models → nothing to do). `themePreset` drives mind-map branch colour so
// the baked fills match what the map renders today.
export function flattenSubmodels(document, themePreset, styles = DEFAULT_STYLES) {
  if (!document) return document
  const hasMindmap = document.mindmap && document.mindmap.nodes?.length
  const hasFlowchart = document.flowchart && document.flowchart.nodes?.length
  const next = clone(document)
  next.shapes = Array.isArray(next.shapes) ? next.shapes : []
  next.connectors = Array.isArray(next.connectors) ? next.connectors : []

  let z = topZ(next.shapes)
  if (hasMindmap) {
    const mm = flattenMindmap(document.mindmap, themePreset, z, styles)
    next.shapes.push(...mm.shapes)
    next.connectors.push(...mm.connectors)
    z = mm.nextZ
  }
  if (hasFlowchart) {
    const fc = flattenFlowchart(document.flowchart, z)
    next.shapes.push(...fc.shapes)
    next.connectors.push(...fc.connectors)
    z = fc.nextZ
  }

  // The sub-models are dissolved: their content now lives in the shared arrays.
  // A unified doc keeps the keys as null (its render/interaction still probe for
  // them); dropping to null is what lets `META_KEYS` shed them from collab later.
  next.mindmap = null
  next.flowchart = null
  return next
}
