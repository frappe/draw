<script setup>
// The diagram canvas. One <svg> with a <g> carrying the viewport transform
// translate(panX panY) scale(zoom). Layer order (bottom→top): paper, GridLayer,
// connectors, shapes (zIndex order), SmartGuidesLayer, HoverArrows,
// SelectionLayer, TextEditor. Opens fit-to-view + centered (spec §4.1).
//
// Dynamic pan area (spec §4.1): the pannable region is the canvas rect plus a
// small margin, stretched to enclose any shape that leaves the canvas and
// auto-shrunk when it returns. Native scrollbars appear when that region (in
// screen pixels) exceeds the viewport. Browser ctrl-zoom is intercepted.
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick, provide, inject } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { themeVarStyle } from '@/diagram/theme.js'
import { axisAlignedBBox, anchorPoint, pointInShape } from '@/diagram/geometry.js'
import { isVisible, isInteractable } from '@/diagram/shapeFlags.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { flowchartContentBounds } from '@/diagram/flowchartLayout.js'
import { whiteboardContentBounds } from '@/diagram/whiteboardLayout.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useSelection } from '@/composables/useSelection.js'
import { useShapeCreation } from '@/composables/useShapeCreation.js'
import { useImageInsert } from '@/composables/useImageInsert.js'
import { useCanvasPaste } from '@/composables/useCanvasPaste.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { useClipboard } from '@/composables/useClipboard.js'
import ContextMenu from './ContextMenu.vue'
import GridLayer from './GridLayer.vue'
import SectionView from './SectionView.vue'
import ShapeView from './ShapeView.vue'
import ConnectorView from './ConnectorView.vue'
import SmartGuidesLayer from './SmartGuidesLayer.vue'
import HoverArrows from './HoverArrows.vue'
import SelectionLayer from './SelectionLayer.vue'
import TextEditor from './TextEditor.vue'
import MindMapNodeLayer from './MindMapNodeLayer.vue'
import FlowchartLayer from './FlowchartLayer.vue'
import WhiteboardLayer from './WhiteboardLayer.vue'
import Rulers from './Rulers.vue'
import { useModeInteraction } from '@/composables/useModeInteraction.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const modeStrategy = useModeStrategy()
const viewport = editorUi.viewport

// Surface-interaction delegation seam (Part G1/G4): when the active strategy sets
// handlesSurfaceInteraction (flowchart/whiteboard), the type's interaction object
// registered here owns pointer/dblclick/wheel; otherwise we fall back to the
// shared block/mindmap handling below.
const modeInteraction = useModeInteraction()

// A type that renders its own layer replaces the block shape/connector loops.
// Each such type frames its own content bbox for fit + the scroll region (G8).
const rendersOwnLayer = computed(() => modeStrategy.value.rendersOwnLayer)
const activeType = computed(() => modeStrategy.value.type)

// Kept as `isMindmap` for the existing block/mindmap branches below; true only
// for the mind-map auto-layout type (block stays false; flowchart/whiteboard get
// their own branches via activeType).
const isMindmap = computed(() => activeType.value === 'mindmap')
const isFlowchart = computed(() => activeType.value === 'flowchart')
const isWhiteboard = computed(() => activeType.value === 'whiteboard')

const mindmapLayout = computed(() =>
  isMindmap.value && store.state.mindmap ? layoutMindMap(store.state.mindmap) : null,
)

// Derived content bbox per own-layer type, reused for fit-to-view + scroll region
// (Part G8). Null for block (which uses the bounded paper rect).
const ownLayerBounds = computed(() => {
  if (isMindmap.value && mindmapLayout.value) return mindmapLayout.value.bbox
  if (isFlowchart.value && store.state.flowchart) return flowchartContentBounds(store.state.flowchart)
  if (isWhiteboard.value && store.state.whiteboard) {
    return whiteboardContentBounds(store.state.whiteboard, store.state.shapes)
  }
  return null
})

// Canvas interaction layers. Each composable attaches its own window listeners
// during a gesture; here we only route the surface's pointer/drag/dblclick.
const selection = useSelection(store, editorUi)
const creation = useShapeCreation(store, editorUi)
const imageInsert = useImageInsert(store)
// The whiteboard object selection lives here (separate from block shape
// selection); we clear it when a block shape on the board is picked, so the two
// selections never both show (S13/U1).
const whiteboardUi = useWhiteboardUi()
// The reverse guard: when a whiteboard object gets selected — including a sticky,
// whose own handler stops propagation and never reaches the surface — drop any
// lingering block-shape selection, so only one contextual toolbar is ever shown.
watch(
  () => whiteboardUi.state.selection.length,
  (n) => {
    if (n && store.state.selection.length) store.clearSelection()
  },
)

// Dropping an image FILE inserts it at the drop point; otherwise fall back to the
// palette-tile drop. dragover must preventDefault for files so the drop fires.
function onCanvasDragOver(event) {
  if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault()
  else creation.onCanvasDragOver(event)
}
function onCanvasDrop(event) {
  const file = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'))
  if (file) {
    event.preventDefault()
    const point = selection.toLogicalFor(event, surface.value, viewport)
    imageInsert.insert(file, point)
    return
  }
  creation.onCanvasDrop(event)
}
const editing = useTextEditing(store, editorUi)
const clipboard = useClipboard(store)

// Cmd/Ctrl+V: paste an OS-clipboard image at the viewport centre, else the
// internal shape buffer (spec 2.6). Owns paste so the keyboard composable doesn't.
useCanvasPaste({ imageInsert, clipboard, getCenter: () => viewportCenterPoint() })

// Logical canvas point at the centre of the visible viewport (where a pasted
// image lands, so it appears in view regardless of pan/zoom).
function viewportCenterPoint() {
  const { panX, panY, zoom } = viewport.state
  return { x: (viewWidth.value / 2 - panX) / zoom, y: (viewHeight.value / 2 - panY) / zoom }
}

// Right-click context menu (suppresses the browser default). Items differ for a
// shape vs empty canvas.
const contextMenu = reactive({ show: false, x: 0, y: 0, items: [] })

function onContextMenu(event) {
  const point = selection.toLogicalFor(event, surface.value, viewport)
  const shape = activeType.value === 'block' ? topShapeAt(point, { includeLocked: true }) : null
  if (shape && shape.locked) {
    // Don't pull a locked shape into the selection; just offer to unlock it.
    contextMenu.items = lockedMenuItems(shape)
  } else if (shape) {
    if (!store.state.selection.includes(shape.id)) store.select(shape.id)
    contextMenu.items = shapeMenuItems()
  } else {
    if (activeType.value === 'block') store.clearSelection()
    contextMenu.items = emptyMenuItems()
  }
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.show = true
}

function shapeMenuItems() {
  const ids = store.state.selection
  const items = []
  if (ids.length === 1) items.push({ label: 'Edit text', icon: 'type', onClick: () => editing.beginTextEdit(ids[0]) })
  items.push(
    { label: 'Duplicate', icon: 'copy', shortcut: '⌘D', onClick: () => store.duplicate(ids) },
    { label: 'Copy', icon: 'clipboard', shortcut: '⌘C', onClick: () => clipboard.copy() },
    { divider: true },
    { label: 'Bring to front', icon: 'chevrons-up', onClick: () => store.bringToFront(ids) },
    { label: 'Send to back', icon: 'chevrons-down', onClick: () => store.sendToBack(ids) },
    { divider: true },
    // Lock keeps it on-canvas but un-grabbable; Hide removes it from view (spec 7.4).
    { label: 'Lock', icon: 'lock', onClick: () => store.updateShapes(ids, { locked: true }) },
    { label: 'Hide', icon: 'eye-off', onClick: () => store.updateShapes(ids, { hidden: true }) },
    { divider: true },
    { label: 'Delete', icon: 'trash-2', danger: true, shortcut: 'Del', onClick: () => store.removeSelectionOrIds(ids) },
  )
  return items
}

// Minimal menu for a locked shape (it isn't selected, so actions target its id).
function lockedMenuItems(shape) {
  return [
    { label: 'Unlock', icon: 'unlock', onClick: () => store.updateShape(shape.id, { locked: false }) },
    { label: 'Hide', icon: 'eye-off', onClick: () => store.updateShape(shape.id, { hidden: true }) },
  ]
}

function emptyMenuItems() {
  const items = [
    { label: 'Paste', icon: 'clipboard', shortcut: '⌘V', onClick: () => clipboard.paste() },
    { label: 'Select all', icon: 'maximize', shortcut: '⌘A', onClick: () => store.selectAll() },
  ]
  // Escape hatch for hidden objects (no layers panel yet): bring them all back.
  if (store.state.shapes.some((s) => s.hidden)) {
    items.push({ label: 'Unhide all', icon: 'eye', onClick: () => unhideAll() })
  }
  items.push(
    { divider: true },
    { label: 'Fit to view', icon: 'maximize-2', onClick: () => editorUi.fit() },
  )
  return items
}

function unhideAll() {
  const ids = store.state.shapes.filter((s) => s.hidden).map((s) => s.id)
  if (ids.length) store.updateShapes(ids, { hidden: false })
}

// SelectionLayer renders the marquee rect via this provided handle (spec §7.2).
provide('selectionMarquee', selection.marquee)

const surface = ref(null)
const viewWidth = ref(0)
const viewHeight = ref(0)

const canvas = computed(() => store.state.canvas)
const themeStyle = computed(() => themeVarStyle(store.state.themePreset))

// Shapes render in ascending zIndex order so later items sit on top. Hidden
// shapes (spec 7.4) are dropped from the render list entirely.
const orderedShapes = computed(() =>
  [...store.state.shapes].filter(isVisible).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
)

const groupTransform = computed(
  () => `translate(${viewport.state.panX} ${viewport.state.panY}) scale(${viewport.state.zoom})`,
)

// The dotted background must cover the whole visible viewport at any pan/zoom.
// The GridLayer lives inside the pan/zoom <g> and its dots tile in canvas space,
// so we convert the viewport's pixel box into canvas units (pan is the only
// transform now — no native scroll — so this is just the inverse of the <g>).
const gridBounds = computed(() => {
  const { panX, panY, zoom } = viewport.state
  const pad = 8
  return {
    x: -panX / zoom - pad,
    y: -panY / zoom - pad,
    w: viewWidth.value / zoom + pad * 2,
    h: viewHeight.value / zoom + pad * 2,
  }
})

// The bounding box Fit-to-view should frame: an own-layer type's content bbox
// (mind-map tree / flowchart / whiteboard) or, for block, the union of every
// visible shape + section. Null when there's nothing yet (fall back to paper).
const blockFitBounds = computed(() => {
  const boxes = [
    ...store.state.shapes.filter(isVisible).map(axisAlignedBBox),
    ...(store.state.sections || []).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
  ]
  if (!boxes.length) return null
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
})
const fitBounds = computed(() => (rendersOwnLayer.value ? ownLayerBounds.value : blockFitBounds.value))

// Fit-to-view: frame ALL drawn content, centred, zoomed to fit (≤100%) — even
// content that's currently off-screen. Falls back to the canvas rect when empty.
function fitToView() {
  if (!surface.value) return
  const rect = surface.value.getBoundingClientRect()
  viewWidth.value = rect.width
  viewHeight.value = rect.height
  const b = fitBounds.value
  const size = b ? { w: b.w, h: b.h } : { w: canvas.value.width, h: canvas.value.height }
  const origin = b || { x: 0, y: 0 }
  viewport.setMeasure({
    containerW: rect.width,
    containerH: rect.height,
    canvasW: size.w,
    canvasH: size.h,
    originX: origin.x ?? 0,
    originY: origin.y ?? 0,
  })
  viewport.fit()
}

// Open a diagram at 100% (true size), centred on the content fitToView just
// measured — not zoomed-to-fit. A freshly opened canvas should read at true
// size, and the infinite canvas has no fixed paper to shrink into. The Fit
// control still fits-to-content (fitToView).
function openAtActualSize() {
  fitToView()
  viewport.reset()
}

let resizeObserver = null

onMounted(() => {
  openAtActualSize()
  // Route editorUi.fit() (bottom-left control + ⇧1 shortcut) through fitToView so
  // it refreshes the per-type content bounds before framing (O9).
  editorUi.registerFit(fitToView)
  resizeObserver = new ResizeObserver(() => syncMeasure())
  resizeObserver.observe(surface.value)
  window.addEventListener('keydown', onZoomKey)
})

onBeforeUnmount(() => {
  editorUi.registerFit(null)
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', onZoomKey)
})

// Keep the viewport's container measure current on resize (pan is the sole
// canvas transform now — no native scroll to reconcile).
function syncMeasure() {
  if (!surface.value) return
  const bounds = surface.value.getBoundingClientRect()
  viewWidth.value = bounds.width
  viewHeight.value = bounds.height
  viewport.setMeasure({ containerW: bounds.width, containerH: bounds.height })
}

// The document's canvas dimensions settle after the async load; re-open at 100%
// (true size) when they do, rather than zooming to fit.
watch(
  () => [canvas.value.width, canvas.value.height],
  () => nextTick(openAtActualSize),
)

// As an own-layer type's content grows (tree nodes, flowchart nodes, strokes),
// keep the viewport's fit measure current so the Fit control frames the whole
// content (we don't auto-refit on every change, to avoid a jarring zoom jump
// while the user is building).
watch(
  () => ownLayerBounds.value && [
    ownLayerBounds.value.w, ownLayerBounds.value.h, ownLayerBounds.value.x, ownLayerBounds.value.y,
  ],
  () => {
    if (!rendersOwnLayer.value || isWhiteboard.value) return
    const b = ownLayerBounds.value
    if (!b) return
    viewport.setMeasure({ canvasW: b.w, canvasH: b.h, originX: b.x ?? 0, originY: b.y ?? 0 })
  },
)

function pointerPosition(event) {
  const bounds = surface.value.getBoundingClientRect()
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

// Whether the active strategy delegates surface events to a registered mode
// interaction object (flowchart/whiteboard). Hand-tool panning is never
// delegated — it stays shared so every type pans the same way.
function delegatesSurface() {
  return modeStrategy.value.handlesSurfaceInteraction && modeInteraction.value
}

// Context handed to mode interaction handlers; `point` is already in canvas units
// (Part G4) via the shared viewport transform.
function interactionContext(event) {
  const point = selection.toLogicalFor(event, surface.value, viewport)
  // `editing` is the shared text-editing API (setup-scoped here) so mode
  // interactions can begin inline text edits without re-calling the composable
  // outside setup (e.g. whiteboard double-click-to-type, spec C1/W1).
  return { point, event, viewport, store, editorUi, editing }
}

// Try delegating one surface event to the mode interaction's handler. Returns
// true when the type owns the event so the shared fallback is skipped.
function delegateSurfaceEvent(handlerName, event) {
  if (!delegatesSurface()) return false
  const handler = modeInteraction.value[handlerName]
  if (typeof handler !== 'function') return false
  handler(event, interactionContext(event))
  return true
}

function onWheel(event) {
  if (delegateSurfaceEvent('onWheel', event)) return
  const { x, y } = pointerPosition(event)
  viewport.handleWheel(event, x, y)
}

// Intercept the browser's ctrl/cmd +/- (and 0) zoom; route +/- to the viewport.
function onZoomKey(event) {
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    viewport.zoomStep(1)
  } else if (event.key === '-') {
    event.preventDefault()
    viewport.zoomStep(-1)
  } else if (event.key === '0') {
    event.preventDefault()
    editorUi.reset100()
  }
}

const panning = computed(() => editorUi.state.tool === 'hand')

// --- Section as a draw tool (T4/B6): the 'section' tool arms a crosshair; press
// starts a frame, drag sizes it, release commits + selects it. Works in every
// diagram type, so it's handled here on the shared surface, before the per-type
// delegation. A too-small drag (a plain click) falls back to a default size.
const sectionDraft = ref(null)
let sectionStart = null
const SECTION_MIN_DRAG = 24

function logicalPoint(event) {
  return selection.toLogicalFor(event, surface.value, viewport)
}
function startSectionDraft(event) {
  // Capture the pointer so the surface still gets move/up even if the drag ends
  // off-canvas (over a toolbar / outside the pane) — otherwise the draft rect
  // would be left stuck on screen.
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  sectionStart = logicalPoint(event)
  sectionDraft.value = { x: sectionStart.x, y: sectionStart.y, w: 0, h: 0 }
}
function updateSectionDraft(event) {
  if (!sectionStart) return
  const p = logicalPoint(event)
  sectionDraft.value = {
    x: Math.min(sectionStart.x, p.x),
    y: Math.min(sectionStart.y, p.y),
    w: Math.abs(p.x - sectionStart.x),
    h: Math.abs(p.y - sectionStart.y),
  }
}
// Abandon an in-progress section draft (pointer cancelled) without committing.
function cancelSectionDraft() {
  sectionDraft.value = null
  sectionStart = null
}

function commitSectionDraft() {
  const d = sectionDraft.value
  sectionDraft.value = null
  sectionStart = null
  if (!d) return
  // A click (or tiny drag) drops a comfortable default; a real drag uses its box.
  const draggedEnough = d.w >= SECTION_MIN_DRAG && d.h >= SECTION_MIN_DRAG
  const box = draggedEnough ? d : { x: d.x - 180, y: d.y - 120, w: 360, h: 240 }
  const id = store.addSection(Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h))
  editorUi.selectSection(id)
  editorUi.setTool('select')
}

// Route a surface pointerdown to the active tool: hand pans, draw creates, and
// select runs the normal click/move/marquee selection (spec §7.1/§7.2/§4.3).
function onSurfacePointerDown(event) {
  // A press anywhere but a section's title (which stops propagation) clears the
  // section selection, so its handles/menu disappear.
  editorUi.clearSection()
  // Section draw tool wins before any per-type handling (works in every type).
  if (editorUi.state.tool === 'section') return startSectionDraft(event)
  // Hand tool always pans, for every type (shared transform, Part G4).
  if (editorUi.state.tool === 'hand') return viewport.startPan(event)
  // On the whiteboard, text boxes and images are ordinary block shapes. With the
  // select tool, hand a press that lands on such a shape to the shared block
  // selection (select + drag + shift-add), so they're usable like any shape
  // (S13/U1). A press that misses every shape drops any shape selection and falls
  // through to the whiteboard interaction (strokes/stickies/marquee).
  if (isWhiteboard.value && editorUi.state.tool === 'select') {
    const point = selection.toLogicalFor(event, surface.value, viewport)
    if (topShapeAt(point)) {
      whiteboardUi.clearSelection()
      return selection.onSurfacePointerdown(event)
    }
    if (!event.shiftKey && !event.metaKey && !event.ctrlKey) store.clearSelection()
  }
  // Flowchart/whiteboard own the surface (+ handles, drag-to-empty, pen, sticky):
  // delegate to the registered mode interaction (Part G1).
  if (delegateSurfaceEvent('onPointerDown', event)) return
  // Mind map is auto-layout: no free shape select/draw/move on the surface
  // (node interactions live on the nodes themselves).
  if (isMindmap.value) return
  if (editorUi.state.tool === 'draw') return creation.onCanvasPointerDown(event)
  selection.onSurfacePointerdown(event)
}

function onSurfacePointerMove(event) {
  if (panning.value) return viewport.movePan(event)
  if (editorUi.state.tool === 'section' && sectionDraft.value) return updateSectionDraft(event)
  if (delegateSurfaceEvent('onPointerMove', event)) return
  if (!isMindmap.value && editorUi.state.tool === 'draw') creation.onCanvasPointerMove(event)
}

function onSurfacePointerUp(event) {
  viewport.endPan()
  if (editorUi.state.tool === 'section' && sectionDraft.value) return commitSectionDraft()
  if (delegateSurfaceEvent('onPointerUp', event)) return
  if (!isMindmap.value && editorUi.state.tool === 'draw') creation.onCanvasPointerUp(event)
}

// Double-click: edit the text of a hit shape or the label of a hit connector.
// Double-click on the EMPTY canvas does not create anything (block/flowchart):
// creation is via the bottom palette. Double-click-to-create is whiteboard-only,
// owned by the whiteboard mode interaction (spec §6/§7.1; P4).
function onSurfaceDoubleClick(event) {
  // On the whiteboard, double-clicking an existing text box edits it instead of
  // dropping a new box on top of it (S13). Check shapes before the mode delegate.
  if (isWhiteboard.value) {
    const point = selection.toLogicalFor(event, surface.value, viewport)
    const shape = topShapeAt(point)
    if (shape) return editing.beginTextEdit(shape.id)
  }
  if (delegateSurfaceEvent('onDoubleClick', event)) return
  if (isMindmap.value) return // node text editing arrives in M2
  const point = selection.toLogicalFor(event, surface.value, viewport)
  const shape = topShapeAt(point)
  if (shape) return editing.beginTextEdit(shape.id)
  const connector = connectorAt(point)
  if (connector) return editing.beginConnectorLabelEdit(connector.id)
}

// Topmost shape under a point. By default skips hidden + locked shapes (they
// aren't grabbable); the context menu passes includeLocked so a locked shape can
// still be right-clicked to unlock it. Hidden shapes are never hit.
function topShapeAt(point, { includeLocked = false } = {}) {
  const hits = store.state.shapes.filter(
    (shape) => isVisible(shape) && (includeLocked || isInteractable(shape)) && pointInShape(point, shape),
  )
  if (!hits.length) return null
  return hits.reduce((top, shape) => ((shape.zIndex || 0) >= (top.zIndex || 0) ? shape : top))
}

// Nearest connector whose segment passes within a small logical tolerance of the
// point, resolving attached endpoints to their anchor.
function connectorAt(point) {
  const TOLERANCE = 8
  for (const connector of store.state.connectors) {
    const a = endpointPoint(connector.from)
    const b = endpointPoint(connector.to)
    if (distanceToSegment(point, a, b) <= TOLERANCE) return connector
  }
  return null
}

function endpointPoint(endpoint) {
  if (endpoint?.shapeId) {
    const shape = store.shapeById(endpoint.shapeId)
    if (shape) return anchorPoint(shape, endpoint.anchor || 'right')
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y)
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

// Cursor per pointer mode (spec §7.1): hand = grab, draw = dotted-line plus
// (an SVG data-URI crosshair-plus), select = default arrow.
const DRAW_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><line x1='12' y1='3' x2='12' y2='21' stroke='black' stroke-width='1.5' stroke-dasharray='2 2'/><line x1='3' y1='12' x2='21' y2='12' stroke='black' stroke-width='1.5' stroke-dasharray='2 2'/></svg>\") 12 12, crosshair"

// Whiteboard placement/drawing tools show a crosshair so it's clear a click will
// place/draw (S12: arming Text → crosshair, click starts the text box).
const CROSSHAIR_TOOLS = ['text', 'sticky', 'line', 'table', 'pen', 'highlighter', 'eraser', 'section']
const surfaceCursor = computed(() => {
  const tool = editorUi.state.tool
  if (tool === 'hand') return 'grab'
  if (tool === 'draw') return DRAW_CURSOR
  if (CROSSHAIR_TOOLS.includes(tool)) return 'crosshair'
  return 'default'
})
</script>

<template>
  <div
    ref="surface"
    role="application"
    aria-label="Diagram canvas"
    :data-fdpreset="store.state.themePreset"
    :style="[themeStyle, { cursor: surfaceCursor, background: canvas.background || '#FFFFFF', userSelect: 'none', WebkitUserSelect: 'none' }]"
    class="relative h-full w-full overflow-hidden"
    @wheel.prevent="onWheel"
    @pointerdown="onSurfacePointerDown"
    @pointermove="onSurfacePointerMove"
    @pointerup="onSurfacePointerUp"
    @pointercancel="cancelSectionDraft"
    @pointerleave="viewport.endPan()"
    @dblclick="onSurfaceDoubleClick"
    @contextmenu.prevent="onContextMenu"
    @dragover="onCanvasDragOver"
    @drop="onCanvasDrop"
  >
    <!-- Infinite canvas: pan via wheel / hand tool (no native scrollbars). The
         SVG fills the viewport; the <g> transform handles pan/zoom. -->
    <svg class="pointer-events-none absolute left-0 top-0 h-full w-full">
      <g :transform="groupTransform" class="[&_*]:pointer-events-auto">
        <!-- Dotted guides (all types) on the plain white canvas — no paper/
             background separation; the guide density is the only differentiator.
             Covers the reachable content extent. -->
        <GridLayer
          v-if="editorUi.state.gridVisible"
          :x="gridBounds.x"
          :y="gridBounds.y"
          :width="gridBounds.w"
          :height="gridBounds.h"
          :density="editorUi.state.gridDensity"
        />

        <!-- Named sections/frames — behind everything, in every diagram type. -->
        <SectionView
          v-for="section in store.state.sections"
          :key="section.id"
          :section="section"
          :selected="editorUi.state.selectedSectionId === section.id"
        />

        <!-- Live frame while drawing a section with the section tool (T4). -->
        <rect
          v-if="sectionDraft"
          :x="sectionDraft.x"
          :y="sectionDraft.y"
          :width="sectionDraft.w"
          :height="sectionDraft.h"
          rx="6"
          fill="rgba(110,86,207,0.06)"
          stroke="#006EDB"
          stroke-width="1.5"
          stroke-dasharray="6 4"
        />

        <!-- Block mode: shapes/connectors + overlays on the canvas. -->
        <template v-if="!rendersOwnLayer">
          <ConnectorView
            v-for="connector in store.state.connectors"
            :key="connector.id"
            :connector="connector"
          />

          <ShapeView v-for="shape in orderedShapes" :key="shape.id" :shape="shape" />

          <SmartGuidesLayer />
          <HoverArrows />
          <SelectionLayer />

          <!-- Dashed ghost of the shape/connector being drawn (spec §7.1). -->
          <rect
            v-if="creation.preview.value?.box"
            :x="creation.preview.value.x"
            :y="creation.preview.value.y"
            :width="creation.preview.value.w"
            :height="creation.preview.value.h"
            fill="none"
            stroke="#006EDB"
            stroke-width="1.5"
            stroke-dasharray="6 4"
          />
          <line
            v-else-if="creation.preview.value?.line"
            :x1="creation.preview.value.x1"
            :y1="creation.preview.value.y1"
            :x2="creation.preview.value.x2"
            :y2="creation.preview.value.y2"
            stroke="#006EDB"
            stroke-width="2"
            stroke-dasharray="6 4"
            stroke-linecap="round"
          />

          <TextEditor />
        </template>

        <!-- Mind-map mode: the laid-out tree (spec diagram-types Part A). -->
        <MindMapNodeLayer
          v-else-if="isMindmap && mindmapLayout"
          :mindmap="store.state.mindmap"
          :positions="mindmapLayout.positions"
        />

        <!-- Flowchart mode: typed nodes + orthogonal edges (spec Part B). -->
        <FlowchartLayer
          v-else-if="isFlowchart && store.state.flowchart"
          :flowchart="store.state.flowchart"
        />

        <!-- Whiteboard mode: strokes + stickies + objects (spec Part C). Whiteboard
             text lives in the shared shapes[] (C9), so it reuses the block
             TextEditor overlay for inline double-click-to-type (W1). -->
        <template v-else-if="isWhiteboard && store.state.whiteboard">
          <WhiteboardLayer :whiteboard="store.state.whiteboard" />
          <!-- Selection handles for text/image shapes selected on the board (S13/U1). -->
          <SelectionLayer v-if="store.state.selection.length" />
          <TextEditor />
        </template>
      </g>
    </svg>

    <!-- Rulers in screen space (outside the viewport <g>), shown while editing
         text at any zoom (spec §6). -->
    <Rulers />

    <ContextMenu
      v-if="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
      @close="contextMenu.show = false"
    />
  </div>
</template>

<style scoped>
/* The canvas suppresses native text selection so drawing a line / dragging never
   flashes-selects the text inside shape/sticky foreignObjects (Q15). Editable
   fields (inline text/table/sticky editors) re-enable it so typing + caret
   selection still work. */
:deep([contenteditable='true']),
:deep(input),
:deep(textarea) {
  user-select: text;
  -webkit-user-select: text;
}
</style>
