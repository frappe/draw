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
import { axisAlignedBBox, anchorPoint, pointInShape, unionBounds } from '@/diagram/geometry.js'
import { isVisible, isInteractable } from '@/diagram/shapeFlags.js'
import { layoutMindMap, offsetPositions, mindmapTreeRects } from '@/diagram/mindmapLayout.js'
import { subtreeIds } from '@/diagram/mindmapModel.js'
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
import MindmapHoverHandles from './MindmapHoverHandles.vue'
import FlowchartHoverHandles from './FlowchartHoverHandles.vue'
import TextEditor from './TextEditor.vue'
import MindMapNodeLayer from './MindMapNodeLayer.vue'
import FlowchartLayer from './FlowchartLayer.vue'
import WhiteboardLayer from './WhiteboardLayer.vue'
import Rulers from './Rulers.vue'
import {
  useModeInteraction,
  resolveModeHandlers,
  isWhiteboardTool,
} from '@/composables/useModeInteraction.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { isWhiteboardEmpty } from '@/diagram/whiteboardModel.js'

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

// The unified canvas (roadmap: canvas unification). Detected from the document's
// own type, NOT the strategy — an unknown 'unified' type falls back to the BLOCK
// strategy, so activeType would read 'block'. On a unified doc the shared block
// substrate, the whiteboard layer and the auto-layout models compose over one
// canvas; legacy single-type docs are unchanged. A unified doc ALWAYS renders
// that composed canvas: mind maps and flowcharts on it are ordinary canvas
// objects edited in place, so there is no focus mode that swaps the editor into
// a single-type view (#45).
const isUnified = computed(() => isUnifiedDocument(store.state))
const showBlockLayer = computed(() => !rendersOwnLayer.value || isUnified.value)

// When the whiteboard layer is on screen it paints the shapes itself, interleaved
// with the board objects by zIndex (#27). The block layer must not paint them a
// second time: two copies of every shape means duplicate pointer targets, and the
// block copy sits under all board content whatever its zIndex says.
const whiteboardOwnsShapes = computed(
  () => (isWhiteboard.value || isUnified.value) && Boolean(store.state.whiteboard),
)

const mindmapLayout = computed(() =>
  (isMindmap.value || isUnified.value) && store.state.mindmap ? layoutMindMap(store.state.mindmap) : null,
)

// Frame origins (top-left on the shared canvas) for the auto-layout sub-models on
// the unified canvas. {0,0} for legacy single-type docs (rendered untranslated).
const mmOrigin = computed(() => store.state.mindmap?.origin || { x: 0, y: 0 })
const fcOrigin = computed(() => store.state.flowchart?.origin || { x: 0, y: 0 })

// ----- Unified-canvas mind map / flowchart objects ---------------------------
// A mind map / flowchart on the unified canvas is a selectable, movable object
// whose CONTENT stays live: nodes are clicked, dragged and edited in place, in
// the current viewport (#45). A hit-rect behind the content covers the object's
// padded bbox, so pressing its empty space selects the whole object and dragging
// it repositions the origin as one undo step.
//
// A map holds one object PER TREE (#48): several independent mind maps can sit on
// the canvas, so each gets its own hit-rect and moves on its own. The flowchart
// stays one object — its nodes are individually draggable already.
const FRAME_PAD = 12
const selectedFrame = ref(null) // { kind: 'mindmap' | 'flowchart', id } | null
const frameDrag = reactive({ kind: null, id: null, dx: 0, dy: 0, startX: 0, startY: 0 })

function isFrameSelected(kind, id = null) {
  return selectedFrame.value?.kind === kind && selectedFrame.value?.id === id
}

// The mind map is auto-laid-out around its own origin, so on the unified canvas
// we fold the frame origin into the layout instead of rendering under a
// translate: node hit-testing and drag-to-reparent then work directly in canvas
// units, with no per-frame coordinate conversion (useMindmapInteraction). The
// live drag delta is folded in for the dragged TREE only, leaving the rest put.
const mmPositions = computed(() => {
  const positions = mindmapLayout.value?.positions
  if (!positions || !isUnified.value) return positions || null
  const placed = offsetPositions(positions, mmOrigin.value)
  if (frameDrag.kind !== 'mindmap') return placed
  const dragged = new Set(subtreeIds(store.state.mindmap, frameDrag.id))
  const moved = { ...placed }
  for (const id of dragged) {
    if (moved[id]) moved[id] = { ...moved[id], x: moved[id].x + frameDrag.dx, y: moved[id].y + frameDrag.dy }
  }
  return moved
})

// Padded content bbox for each object: mind-map coords already include the origin
// (mmPositions); flowchart node coords stay local to its origin translate.
const mmBoxes = computed(() => {
  const positions = mmPositions.value
  if (!positions || !store.state.mindmap?.nodes.length) return []
  return mindmapTreeRects(store.state.mindmap, positions, FRAME_PAD)
})
const fcBox = computed(() => {
  if (!store.state.flowchart?.nodes.length) return null
  const b = flowchartContentBounds(store.state.flowchart)
  return { x: b.x - FRAME_PAD, y: b.y - FRAME_PAD, w: b.w + FRAME_PAD * 2, h: b.h + FRAME_PAD * 2 }
})

// The flowchart's render transform with the live drag delta folded in, so the
// object follows the cursor (the mind map carries both in mmPositions).
const renderedFcOrigin = computed(() => {
  if (frameDrag.kind !== 'flowchart') return fcOrigin.value
  return { x: fcOrigin.value.x + frameDrag.dx, y: fcOrigin.value.y + frameDrag.dy }
})

function startFrameDrag(kind, id, event) {
  if (event.button !== 0) return
  selectedFrame.value = { kind, id }
  const p = selection.toLogicalFor(event, surface.value, viewport)
  Object.assign(frameDrag, { kind, id, dx: 0, dy: 0, startX: p.x, startY: p.y })
  window.addEventListener('pointermove', onFrameDragMove)
  window.addEventListener('pointerup', onFrameDragUp)
  window.addEventListener('pointercancel', abortFrameDrag)
}
function onFrameDragMove(event) {
  const p = selection.toLogicalFor(event, surface.value, viewport)
  frameDrag.dx = p.x - frameDrag.startX
  frameDrag.dy = p.y - frameDrag.startY
}
function onFrameDragUp() {
  releaseFrameDrag()
  if (frameDrag.kind === 'mindmap') store.moveMindmapTree(frameDrag.id, frameDrag.dx, frameDrag.dy)
  else if (frameDrag.kind === 'flowchart') store.moveFlowchartFrame(frameDrag.dx, frameDrag.dy)
  Object.assign(frameDrag, { kind: null, id: null, dx: 0, dy: 0 })
}
// A cancelled pointer (a touch scroll taking the gesture over, a lost capture)
// abandons the move instead of committing it. Without this the window listeners
// stay attached with frameDrag.kind set, so the next stray pointerup anywhere
// would write a stale origin to the document.
function abortFrameDrag() {
  releaseFrameDrag()
  Object.assign(frameDrag, { kind: null, id: null, dx: 0, dy: 0 })
}
function releaseFrameDrag() {
  window.removeEventListener('pointermove', onFrameDragMove)
  window.removeEventListener('pointerup', onFrameDragUp)
  window.removeEventListener('pointercancel', abortFrameDrag)
}
onBeforeUnmount(releaseFrameDrag)

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
// The live draw ghost, as a throwaway shape so ShapeView draws the real
// geometry of the armed tool (spec §7.1). Text/image have no outline of their
// own, so they preview as a plain box.
const previewShape = computed(() => {
  const draft = creation.preview.value
  if (!draft?.box) return null
  const type = draft.type === 'text' || draft.type === 'image' ? 'rectangle' : draft.type
  return {
    type: type || 'rectangle',
    x: draft.x,
    y: draft.y,
    w: draft.w,
    h: draft.h,
    rotation: 0,
    opacity: 1,
    fill: 'none',
    border: { color: '#006EDB', width: 1.5, dash: 'dashed' },
  }
})
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
// The centre point lives on the viewport, so the palette's Insert can place a new
// frame on the same anchor.
useCanvasPaste({ imageInsert, clipboard, getCenter: () => viewport.centerPoint() })

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

// Empty while the whiteboard layer owns the shapes — it paints them interleaved
// with the board objects, so painting them here too would duplicate them (#27).
const blockLayerShapes = computed(() => (whiteboardOwnsShapes.value ? [] : orderedShapes.value))

// Block has no own-layer empty prompt (whiteboard/mind-map/flowchart do), so show
// a faint centred hint on a blank block canvas, consistent with the others.
const blockEmpty = computed(() => {
  const noBlock = !orderedShapes.value.length && !store.state.connectors.length
  // On the unified canvas the block prompt is the single empty-state, so it must
  // account for ALL layers — whiteboard ink AND the mind map / flowchart frames —
  // or it wrongly shows "nothing here yet" over real frame content.
  if (isUnified.value) {
    return (
      noBlock &&
      isWhiteboardEmpty(store.state.whiteboard, store.state.shapes) &&
      !store.state.mindmap?.nodes.length &&
      !store.state.flowchart?.nodes.length
    )
  }
  return activeType.value === 'block' && noBlock
})

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
  return unionBounds(boxes)
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

// Re-open at 100% (true size) when a document lands after mount, or when the
// canvas is resized to a different preset — not zoomed to fit.
//
// Each source is its own getter so Vue compares the values, not a wrapper array.
// A single `() => [canvas.value.width, canvas.value.height]` getter returned a
// fresh array whenever `state.canvas` was replaced — which undo/redo and remote
// sync do wholesale, with identical dimensions — so every Ctrl+Z re-ran
// openAtActualSize() and threw the user back to the default view before they
// could see what was undone (#28).
watch(
  [() => store.state.loadCount, () => canvas.value.width, () => canvas.value.height],
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
  // On the unified canvas, only the unambiguous whiteboard tools delegate to the
  // whiteboard layer; select/shape/connector tools fall through to the shared
  // block handling. Legacy single-type docs delegate whenever the strategy says so.
  if (isUnified.value) {
    return isWhiteboardTool(editorUi.state.tool) && activeModeHandlers() != null
  }
  return modeStrategy.value.handlesSurfaceInteraction && activeModeHandlers() != null
}

// The registered handler object that owns surface events for the active tool
// (resolved from the layer-keyed registry). Null when no layer is registered.
function activeModeHandlers() {
  return resolveModeHandlers(modeInteraction.value, editorUi.state.tool)
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

// --- Flowchart objects on the unified canvas (#45) ---------------------------
// The flowchart's own interaction is surface-delegated (it reads data-fc-node off
// the event target), so on the unified canvas we route just the presses that land
// on its content to it, in the frame-local coords its layer renders in. A gesture
// flag keeps the following move/up going to the same place. Everything happens
// where the object already sits — no focus mode, no camera move.
const flowchartGesture = ref(false)

function unifiedFlowchartHandlers() {
  return isUnified.value ? modeInteraction.value.flowchart || null : null
}

function flowchartContext(event) {
  const context = interactionContext(event)
  const origin = fcOrigin.value
  return { ...context, point: { x: context.point.x - origin.x, y: context.point.y - origin.y } }
}

function delegateFlowchartEvent(handlerName, event) {
  const handlers = unifiedFlowchartHandlers()
  if (!handlers) return false
  if (handlerName === 'onPointerDown') {
    if (editorUi.state.tool !== 'select') return false
    if (!event.target?.closest?.('[data-fc-node]')) return false
    flowchartGesture.value = true
  } else if (!flowchartGesture.value) return false
  handlers[handlerName]?.(event, flowchartContext(event))
  if (handlerName === 'onPointerUp') flowchartGesture.value = false
  return true
}

// Try delegating one surface event to the mode interaction's handler. Returns
// true when the type owns the event so the shared fallback is skipped.
function delegateSurfaceEvent(handlerName, event) {
  if (!delegatesSurface()) return false
  const handlers = activeModeHandlers()
  const handler = handlers && handlers[handlerName]
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

// Any press drops the mind-map/flowchart object selection; a press on that
// object's own hit-rect re-selects it immediately after. Capture phase, because
// its content (mind-map nodes) stops propagation and would otherwise leave the
// object's outline showing while a node inside it is being edited.
function onSurfacePointerDownCapture(event) {
  selectedFrame.value = null
  // A press outside a flowchart object closes its open node-type picker / pending
  // connector, the same as pressing its own empty canvas does in single-type mode.
  const flowchart = unifiedFlowchartHandlers()
  if (flowchart && !event.target?.closest?.('[data-fc-node], [data-fc-picker]')) flowchart.cancel?.()
}

// Route a surface pointerdown to the active tool: hand pans, draw creates, and
// select runs the normal click/move/marquee selection (spec §7.1/§7.2/§4.3).
function onSurfacePointerDown(event) {
  // A press anywhere but a section's title (which stops propagation) clears the
  // section selection, so its handles/menu disappear.
  editorUi.clearSection()
  // The object selection is cleared in the CAPTURE phase above, not here: a
  // mind-map node stops propagation, so a press on one never reaches this handler
  // and the object's outline would linger while its node is being edited.
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
  // delegate to the registered mode interaction (Part G1). Capture the pointer so
  // a drag gesture (pen stroke, eraser, line) still receives move/up even when it
  // ends off the surface — over the bottom palette or outside the pane. Without
  // this, finishStroke/finishErase/finishLine never run: the live stroke lingers,
  // the erase can't be undone, and the drawn line is silently dropped.
  if (delegateSurfaceEvent('onPointerDown', event)) {
    surface.value?.setPointerCapture?.(event.pointerId)
    return
  }
  // A press on a flowchart object's node/port drives that object in place.
  if (delegateFlowchartEvent('onPointerDown', event)) {
    surface.value?.setPointerCapture?.(event.pointerId)
    return
  }
  // Mind map is auto-layout: no free shape select/draw/move on the surface
  // (node interactions live on the nodes themselves).
  if (isMindmap.value) return
  if (editorUi.state.tool === 'draw') return creation.onCanvasPointerDown(event)
  selection.onSurfacePointerdown(event)
}

function onSurfacePointerMove(event) {
  if (panning.value) return viewport.movePan(event)
  if (delegateSurfaceEvent('onPointerMove', event)) return
  if (delegateFlowchartEvent('onPointerMove', event)) return
  if (!isMindmap.value && editorUi.state.tool === 'draw') creation.onCanvasPointerMove(event)
}

function onSurfacePointerUp(event) {
  viewport.endPan()
  if (delegateSurfaceEvent('onPointerUp', event)) return
  if (delegateFlowchartEvent('onPointerUp', event)) return
  if (!isMindmap.value && editorUi.state.tool === 'draw') creation.onCanvasPointerUp(event)
}

// A cancelled pointer (browser gesture takeover, lost capture) must end whatever
// the press started, or the next move would be read as a continuing drag. A frame
// move binds its own window-level pointercancel (abortFrameDrag), which also
// covers cancels that never reach the surface.
function onSurfacePointerCancel() {
  flowchartGesture.value = false
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

// Pen tool: a pen glyph whose nib tip is the hotspot (bottom-left), so it draws
// exactly where the tip points — reads as "you're drawing" (spec §7.1).
const PEN_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M3 21 L4.5 16 L16 4.5 L19.5 8 L8 19.5 Z' fill='white' stroke='black' stroke-width='1.4' stroke-linejoin='round'/><line x1='14.5' y1='6' x2='18' y2='9.5' stroke='black' stroke-width='1.4'/><path d='M3 21 L4.5 16 L8 19.5 Z' fill='black'/></svg>\") 3 21, crosshair"

// Eraser tool: a circle the size of the actual tip, centered on the pointer, so
// the size picked in the eraser options is visible while erasing (#39). The tip
// radius is in canvas units, so it scales with zoom; clamped to what a cursor
// image may be (browsers drop oversized ones).
function eraserCursor(radius, zoom) {
  const diameter = Math.max(8, Math.min(96, radius * 2 * zoom))
  const box = diameter + 4
  const center = box / 2
  return (
    `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${box}' height='${box}' ` +
    `viewBox='0 0 ${box} ${box}'><circle cx='${center}' cy='${center}' r='${diameter / 2}' fill='white' ` +
    `fill-opacity='0.35' stroke='black' stroke-width='1.5'/></svg>") ${center} ${center}, auto`
  )
}

// Whiteboard placement/drawing tools show a crosshair so it's clear a click will
// place/draw (S12: arming Text → crosshair, click starts the text box). Pen and
// eraser get glyph cursors that look like the tool.
const CROSSHAIR_TOOLS = ['text', 'sticky', 'line', 'table', 'highlighter']
const surfaceCursor = computed(() => {
  const tool = editorUi.state.tool
  if (tool === 'hand') return 'grab'
  if (tool === 'draw') return DRAW_CURSOR
  if (tool === 'pen') return PEN_CURSOR
  if (tool === 'eraser') return eraserCursor(whiteboardUi.state.eraserSize, viewport.state.zoom)
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
    @pointerdown.capture="onSurfacePointerDownCapture"
    @pointerdown="onSurfacePointerDown"
    @pointermove="onSurfacePointerMove"
    @pointerup="onSurfacePointerUp"
    @pointercancel="onSurfacePointerCancel"
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

        <!-- Block substrate: shapes/connectors + overlays. Renders for block mode
             AND the unified canvas (where the whiteboard layer composes on top). -->
        <template v-if="showBlockLayer">
          <ConnectorView
            v-for="connector in store.state.connectors"
            :key="connector.id"
            :connector="connector"
          />

          <ShapeView v-for="shape in blockLayerShapes" :key="shape.id" :shape="shape" />

          <SmartGuidesLayer />
          <HoverArrows />
          <SelectionLayer />
          <!-- On-canvas "+" add-handles for migrated mind-map nodes (#118): a no-op
               unless the canvas holds role-tagged mind-map shapes, so legacy
               single-type maps (MindMapNodeLayer, below) are unaffected. -->
          <MindmapHoverHandles />
          <!-- The flowchart counterpart (#77): a single "+" below a migrated
               flowchart node. A no-op unless the canvas holds role-tagged flowchart
               shapes, so legacy single-type charts (FlowchartLayer, below) are
               unaffected. -->
          <FlowchartHoverHandles />

          <!-- Dashed ghost of the shape/connector being drawn (spec §7.1). The
               shape ghost reuses ShapeView so the preview matches the armed
               tool's real outline; it never takes pointer events. -->
          <g v-if="previewShape" style="pointer-events: none">
            <ShapeView :shape="previewShape" />
          </g>
          <line
            v-if="creation.preview.value?.line"
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

        <!-- Mind-map mode: the laid-out tree (spec diagram-types Part A). Legacy
             single-type only for now; becomes a frame on the unified canvas later. -->
        <MindMapNodeLayer
          v-if="isMindmap && mindmapLayout"
          :mindmap="store.state.mindmap"
          :positions="mindmapLayout.positions"
        />

        <!-- Flowchart mode: typed nodes + orthogonal edges (spec Part B). Legacy
             single-type only for now; becomes a frame on the unified canvas later. -->
        <FlowchartLayer
          v-if="isFlowchart && store.state.flowchart"
          :flowchart="store.state.flowchart"
        />

        <!-- Unified canvas: mind map & flowchart are ordinary canvas objects (#45).
             Their content is live — nodes select, drag and edit in place — with a
             hit-rect BEHIND it so pressing the object's empty space selects and
             moves the whole thing. The mind map's origin is baked into
             mmPositions, so its group only carries the live drag delta. -->
        <g v-if="isUnified && mmPositions && store.state.mindmap.nodes.length">
          <!-- One hit-rect per tree: a map can hold several independent mind maps
               (#48), and each has to select and move on its own. -->
          <rect
            v-for="tree in mmBoxes" :key="tree.rootId"
            :x="tree.x" :y="tree.y" :width="tree.w" :height="tree.h" rx="10"
            :fill="isFrameSelected('mindmap', tree.rootId) ? 'rgba(0,110,219,0.04)' : 'transparent'"
            :stroke="isFrameSelected('mindmap', tree.rootId) ? '#006EDB' : 'transparent'"
            :stroke-width="isFrameSelected('mindmap', tree.rootId) ? 1.5 : 0"
            stroke-dasharray="6 4" style="cursor: move"
            @pointerdown.stop="startFrameDrag('mindmap', tree.rootId, $event)"
          />
          <MindMapNodeLayer
            :mindmap="store.state.mindmap"
            :positions="mmPositions"
            :marquee-backdrop="false"
          />
        </g>
        <g v-if="isUnified && store.state.flowchart.nodes.length && fcBox"
          :transform="`translate(${renderedFcOrigin.x} ${renderedFcOrigin.y})`">
          <rect
            :x="fcBox.x" :y="fcBox.y" :width="fcBox.w" :height="fcBox.h" rx="10"
            :fill="isFrameSelected('flowchart') ? 'rgba(0,110,219,0.04)' : 'transparent'"
            :stroke="isFrameSelected('flowchart') ? '#006EDB' : 'transparent'"
            :stroke-width="isFrameSelected('flowchart') ? 1.5 : 0"
            stroke-dasharray="6 4" style="cursor: move"
            @pointerdown.stop="startFrameDrag('flowchart', null, $event)"
          />
          <!-- Deliberately NOT wrapped in .unified-frame-content. That wrapper made
               the content non-interactive so a double-click could land on the
               hit-rect and ENTER the frame (#50); #45 removes focus mode and edits
               both models in place, so the nodes have to stay live. The hit-rect
               above is painted first and therefore sits behind them: a press on the
               object's empty space selects and moves the whole thing, a press on a
               node edits that node. Re-adding the wrapper would make flowchart nodes
               unreachable on the unified canvas. -->
          <FlowchartLayer :flowchart="store.state.flowchart" />
        </g>

        <!-- Whiteboard: strokes + stickies + objects (spec Part C). Renders for a
             legacy whiteboard AND the unified canvas. Whiteboard text lives in the
             shared shapes[] (C9), reusing the block TextEditor overlay (W1). -->
        <template v-if="(isWhiteboard || isUnified) && store.state.whiteboard">
          <WhiteboardLayer :whiteboard="store.state.whiteboard" />
          <!-- A legacy whiteboard has no block substrate, so it supplies its own
               selection + text overlays. On the unified canvas the block substrate
               above already provides these — don't double-mount them. -->
          <template v-if="isWhiteboard && !isUnified">
            <SelectionLayer v-if="store.state.selection.length" />
            <TextEditor />
          </template>
        </template>
      </g>
    </svg>

    <!-- Empty-state hint on a blank block canvas (screen-centred, non-interactive)
         — mirrors the whiteboard/mind-map/flowchart prompts. -->
    <div
      v-if="blockEmpty"
      class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-center"
    >
      <div class="text-[15px] font-medium text-ink-gray-4">Nothing here yet</div>
      <div class="mt-1 text-[13px] text-ink-gray-3">Click the + button below to add your first shape</div>
    </div>

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
