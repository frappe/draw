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
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick, provide, inject } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useComments } from '@/composables/useComments.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { themeVarStyle } from '@/diagram/theme.js'
import { axisAlignedBBox, anchorPoint, pointInShape, unionBounds } from '@/diagram/geometry.js'
import { isVisible, isInteractable } from '@/diagram/shapeFlags.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { mindmapNodeClickAction } from '@/diagram/freeFloating.js'
import { isAdditiveEvent } from '@/composables/pointer.js'
import { flowchartContentBounds } from '@/diagram/flowchartLayout.js'
import { whiteboardContentBounds } from '@/diagram/whiteboardLayout.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { editTableCellAt } from '@/composables/useWhiteboardInteraction.js'
import { useSelection } from '@/composables/useSelection.js'
import { useShapeCreation, draftPreviewShape } from '@/composables/useShapeCreation.js'
import { usePolygonCreation } from '@/composables/usePolygonCreation.js'
import { useImageInsert } from '@/composables/useImageInsert.js'
import { useCanvasPaste } from '@/composables/useCanvasPaste.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { useClipboard } from '@/composables/useClipboard.js'
import GridLayer from './GridLayer.vue'
import SectionView from './SectionView.vue'
import ShapeView from './ShapeView.vue'
import ConnectorView from './ConnectorView.vue'
import SmartGuidesLayer from './SmartGuidesLayer.vue'
import HoverArrows from './HoverArrows.vue'
import SelectionLayer from './SelectionLayer.vue'
import HoverOutline from './HoverOutline.vue'
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
const comments = useComments()

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
  isMindmap.value && store.state.mindmap ? layoutMindMap(store.state.mindmap) : null,
)

// Frame origin (top-left on the shared canvas) for the flowchart sub-model on a
// legacy single-type doc. {0,0} for a unified doc, whose flowchart nodes are
// ordinary shapes and whose sub-model is empty (free-floating #122).
const fcOrigin = computed(() => store.state.flowchart?.origin || { x: 0, y: 0 })

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
// The polygon tool (#139) is a multi-click gesture, not the press-drag-release draw
// above — clicks place vertices and the path closes on itself. It owns the surface
// only while the polygon draw type is armed; every other draw type stays on the
// rubber-band flow.
const polygon = usePolygonCreation(store, editorUi)
const isPolygonTool = computed(
  () => editorUi.state.tool === 'draw' && editorUi.state.drawShapeType === 'polygon',
)
// The in-progress vertices as an SVG polyline (raw canvas units, not yet a shape).
const polygonPreviewPoints = computed(() => polygon.vertices.value.map((p) => `${p.x},${p.y}`).join(' '))
const polygonLastVertex = computed(() => polygon.vertices.value[polygon.vertices.value.length - 1] || null)
// The live draw ghost, as a throwaway shape so ShapeView draws the real
// geometry of the armed tool (spec §7.1) and the preview matches the committed
// shape (#130). The mapping is a pure, unit-tested helper.
const previewShape = computed(() => draftPreviewShape(creation.preview.value))
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

// A single click on a free-floating mind-map node's LABEL edits its text (#123):
// recorded on pointerdown (which also selects it) and resolved on pointerup, but
// only if the pointer barely moved — a drag-move must never trip text edit. A
// click on the node's border rim (or on any non-mindmap shape) just selects, so
// only the label zone arms this. Logical point of the press, or null.
const pendingNodeEdit = ref(null)
// Logical-unit slack between press and release still counting as a click, not a
// drag — mirrors useShapeTransform's MOVE_THRESHOLD so the two agree.
const NODE_EDIT_CLICK_SLACK = 3

// Cmd/Ctrl+V: paste an OS-clipboard image at the viewport centre, else the
// internal shape buffer (spec 2.6). Owns paste so the keyboard composable doesn't.
// The centre point lives on the viewport, so the palette's Insert can place a new
// frame on the same anchor.
useCanvasPaste({ imageInsert, clipboard, getCenter: () => viewport.centerPoint() })

// Right-click (suppresses the browser default) selects the hit shape, same as a
// left-click would — it must never open a menu (#244): only the horizontal
// floating selection toolbar is expected to appear.
function onContextMenu(event) {
  const point = selection.toLogicalFor(event, surface.value, viewport)
  const shape = activeType.value === 'block' ? topShapeAt(point) : null
  if (shape) {
    if (!store.state.selection.includes(shape.id)) store.select(shape.id)
  } else if (activeType.value === 'block') {
    store.clearSelection()
  }
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
  // account for every layer. Mind-map / flowchart nodes are ordinary shapes now
  // (free-floating #122), so `noBlock` already covers them; only the whiteboard
  // ink needs a separate check.
  if (isUnified.value) {
    return noBlock && isWhiteboardEmpty(store.state.whiteboard, store.state.shapes)
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

// A press outside a flowchart object closes its open node-type picker / pending
// connector, the same as pressing its own empty canvas does in single-type mode.
// Capture phase, because a flowchart node stops propagation and would otherwise
// never reach this handler.
function onSurfacePointerDownCapture(event) {
  const flowchart = unifiedFlowchartHandlers()
  if (flowchart && !event.target?.closest?.('[data-fc-node], [data-fc-picker]')) flowchart.cancel?.()
}

// Route a surface pointerdown to the active tool: hand pans, draw creates, and
// select runs the normal click/move/marquee selection (spec §7.1/§7.2/§4.3).
function onSurfacePointerDown(event) {
  // A press anywhere but a section's title (which stops propagation) clears the
  // section selection, so its handles/menu disappear.
  editorUi.clearSection()
  // A press on the canvas closes an open comment thread card (#108). Its own pin and
  // card controls live in the overlay, not on this surface, so they aren't affected.
  if (comments?.activeThread?.value) comments.closeThread()
  // Hand tool always pans, for every type (shared transform, Part G4).
  if (editorUi.state.tool === 'hand') return viewport.startPan(event)
  // An armed add-comment (#108) drops a comment pin at the click — on the shape under
  // the pointer, or the board point if it misses — then disarms. Before the type
  // routing (like the starter below) so an armed comment click always places.
  if (placeArmedComment(event)) return
  // A catalog-armed starter (mind map / flowchart) drops its first node at the click
  // point, then disarms — the arm-then-click model shape tools use (#75). Handled
  // before the select/whiteboard/flowchart routing so an armed click always places.
  if (creation.placeArmedStarter(event)) return
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
  if (editorUi.state.tool === 'draw') {
    // Polygon places a vertex per click (and closes on the first vertex); every
    // other draw type starts the press-drag-release draft.
    if (isPolygonTool.value) return polygon.onPointerDown(selection.toLogicalFor(event, surface.value, viewport))
    return creation.onCanvasPointerDown(event)
  }
  // Arm single-click-to-edit for a free-floating mind-map node before the shared
  // selection runs (which selects it + starts a possible drag). Pointerup decides
  // click-vs-drag and edits only on a click in the label zone (#123).
  captureNodeEditIntent(event)
  selection.onSurfacePointerdown(event)
}

// Record a pending text-edit when a plain press lands on the LABEL zone of a
// free-floating mind-map node. Additive/Alt presses (multi-select, duplicate-
// drag) and border-rim or non-mindmap presses arm nothing, so they only select.
function captureNodeEditIntent(event) {
  pendingNodeEdit.value = null
  if (editorUi.state.tool !== 'select' || event.button !== 0) return
  if (isAdditiveEvent(event) || event.altKey || !surface.value) return
  const point = selection.toLogicalFor(event, surface.value, viewport)
  const shape = topShapeAt(point)
  if (mindmapNodeClickAction(shape, point) !== 'edit') return
  // Select-first (#123): the FIRST click on a node just selects it; only a click on
  // an ALREADY-selected node's label edits. This runs before selection.onSurfacePointerdown,
  // so store.state.selection is still the pre-click selection.
  const sel = store.state.selection
  if (!(sel.length === 1 && sel[0] === shape.id)) return
  pendingNodeEdit.value = { id: shape.id, x: point.x, y: point.y }
}

// Resolve the armed edit on release: if the pointer stayed put it was a click,
// not a drag-move — begin editing that node's text. Returns true when it handled
// the release. A drag past the slack leaves it to the move that already ran.
function resolveNodeEditIntent(event) {
  const pending = pendingNodeEdit.value
  pendingNodeEdit.value = null
  if (!pending || !surface.value) return false
  const point = selection.toLogicalFor(event, surface.value, viewport)
  if (Math.abs(point.x - pending.x) >= NODE_EDIT_CLICK_SLACK) return false
  if (Math.abs(point.y - pending.y) >= NODE_EDIT_CLICK_SLACK) return false
  editing.beginTextEdit(pending.id)
  return true
}

function onSurfacePointerMove(event) {
  if (panning.value) return viewport.movePan(event)
  if (delegateSurfaceEvent('onPointerMove', event)) return
  if (delegateFlowchartEvent('onPointerMove', event)) return
  if (!isMindmap.value && editorUi.state.tool === 'draw') {
    // The polygon's rubber-band follows the cursor with no button pressed.
    if (isPolygonTool.value) return polygon.onPointerMove(selection.toLogicalFor(event, surface.value, viewport))
    creation.onCanvasPointerMove(event)
  }
}

function onSurfacePointerUp(event) {
  viewport.endPan()
  if (delegateSurfaceEvent('onPointerUp', event)) return
  if (delegateFlowchartEvent('onPointerUp', event)) return
  // A click (not a drag) on a mind-map node's label drops the caret in (#123).
  if (resolveNodeEditIntent(event)) return
  // Polygon has no drag to finish — its clicks are handled on pointer-down.
  if (!isMindmap.value && editorUi.state.tool === 'draw' && !isPolygonTool.value) {
    creation.onCanvasPointerUp(event)
  }
}

// A cancelled pointer (browser gesture takeover, lost capture) must end whatever
// the press started, or the next move would be read as a continuing drag.
function onSurfacePointerCancel() {
  flowchartGesture.value = false
}

// Double-click: edit the text of a hit shape or the label of a hit connector.
// Double-click on the EMPTY canvas does not create anything (block/flowchart):
// creation is via the bottom palette. Double-click-to-create is whiteboard-only,
// owned by the whiteboard mode interaction (spec §6/§7.1; P4).
function onSurfaceDoubleClick(event) {
  // Double-click closes the in-progress polygon (its two presses already dropped
  // the final vertices; the builder drops the duplicate). Consume it so it never
  // falls through to text-editing the shape it just created.
  if (isPolygonTool.value && polygon.isActive.value) return polygon.close()
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
  // A table cell on the unified canvas (#354). Only whiteboard TOOLS delegate
  // there, so the select tool never reaches the whiteboard's own double-click
  // handler and a cell could not be opened this way at all. Routed here, after
  // the block-shape check and only for a table actually under the cursor, so
  // double-clicking empty unified canvas still does nothing rather than
  // dropping a whiteboard text box on it.
  if (isUnified.value && editTableCellAt(store, point)) return
  const connector = connectorAt(point)
  if (connector) return editing.beginConnectorLabelEdit(connector.id)
}

// Consume an armed add-comment click (#108): anchor the pin to the shape under the
// pointer, or drop it at the board point if the click misses every shape, then open
// its composer. Returns true when it handled the press so normal routing is skipped.
function placeArmedComment(event) {
  // `comments` is absent in the read-only viewer (no provider there); the pending
  // flag can never be set without the toolbar, but guard the dereference anyway.
  if (!comments || !editorUi.state.pendingComment || event.button !== 0) return false
  const point = selection.toLogicalFor(event, surface.value, viewport)
  const shape = topShapeAt(point)
  if (shape) comments.startDraft({ anchorType: 'shape', shapeId: shape.id })
  else comments.startDraft({ anchorType: 'board', x: point.x, y: point.y })
  editorUi.clearComment()
  return true
}

// Topmost shape under a point. Skips hidden + locked shapes (they aren't
// grabbable/selectable).
function topShapeAt(point) {
  const hits = store.state.shapes.filter(
    (shape) => isVisible(shape) && isInteractable(shape) && pointInShape(point, shape),
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
// place/draw (S12: arming Text → crosshair, click starts the text box). The
// merged Draw tool (key 'pen', both its pen and highlighter sub-modes, #242) and
// eraser get glyph cursors that look like the tool instead.
const CROSSHAIR_TOOLS = ['text', 'sticky', 'line', 'table']
const surfaceCursor = computed(() => {
  const tool = editorUi.state.tool
  // A starter armed for click-to-place (#75) shows the same placement crosshair as an
  // armed shape tool, so it reads as "click to drop it here".
  if (editorUi.state.pendingStarter) return DRAW_CURSOR
  // An armed add-comment (#108) reads as "click to drop a comment here".
  if (editorUi.state.pendingComment) return DRAW_CURSOR
  if (tool === 'hand') return 'grab'
  if (tool === 'draw') return DRAW_CURSOR
  if (tool === 'pen') return PEN_CURSOR
  if (tool === 'eraser') return eraserCursor(whiteboardUi.state.eraserSize, viewport.state.zoom)
  // Armed laser shows only the red dot, not the OS arrow on top of it (#253).
  if (tool === 'laser') return 'none'
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

          <ShapeView v-for="shape in blockLayerShapes" :key="shape.id" :shape="shape" :selected="store.state.selection.includes(shape.id)" />

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

          <!-- In-progress polygon (#139): the placed edges, a rubber-band segment to
               the cursor, and a dot per vertex. The first dot swells into a snap ring
               when the cursor is close enough to close the path. Non-interactive so it
               never intercepts the next vertex click. -->
          <g v-if="isPolygonTool && polygon.isActive.value" style="pointer-events: none">
            <polyline
              v-if="polygon.vertices.value.length > 1"
              :points="polygonPreviewPoints"
              fill="none"
              stroke="#006EDB"
              stroke-width="1.5"
              stroke-dasharray="6 4"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            <line
              v-if="polygon.cursor.value && polygonLastVertex"
              :x1="polygonLastVertex.x"
              :y1="polygonLastVertex.y"
              :x2="polygon.cursor.value.x"
              :y2="polygon.cursor.value.y"
              stroke="#006EDB"
              stroke-width="1.5"
              stroke-dasharray="6 4"
              stroke-linecap="round"
            />
            <circle
              v-for="(v, i) in polygon.vertices.value"
              :key="i"
              :cx="v.x"
              :cy="v.y"
              :r="i === 0 && polygon.nearFirst.value ? 7 : 3.5"
              :fill="i === 0 && polygon.nearFirst.value ? '#006EDB' : '#FFFFFF'"
              stroke="#006EDB"
              stroke-width="1.5"
            />
          </g>
        </template>

        <!-- Mind-map mode: the laid-out tree (spec diagram-types Part A). Legacy
             single-type docs only — on the unified canvas mind-map nodes are
             free-floating shapes painted by the block substrate above (#122). -->
        <MindMapNodeLayer
          v-if="isMindmap && mindmapLayout"
          :mindmap="store.state.mindmap"
          :positions="mindmapLayout.positions"
        />

        <!-- Flowchart mode: typed nodes + orthogonal edges (spec Part B). Legacy
             single-type docs only — on the unified canvas flowchart nodes are
             free-floating shapes painted by the block substrate above (#122). -->
        <FlowchartLayer
          v-if="isFlowchart && store.state.flowchart"
          :flowchart="store.state.flowchart"
        />

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

        <!-- The inline text editor must paint ABOVE every shape layer — including
             the whiteboard-owned shapes on the unified canvas, whose opaque node
             fills would otherwise occlude the live caret + text until blur (#258).
             So the single shared overlay lives last, still gated to the block
             substrate (a legacy whiteboard mounts its own copy above instead). -->
        <TextEditor v-if="showBlockLayer" />

        <!-- Hover affordance: a subtle outline on the shape under the cursor.
             Painted last (same reason as the editor) so an opaque shape can't
             occlude it on the unified canvas (#261). -->
        <HoverOutline v-if="showBlockLayer" />
      </g>
    </svg>

    <!-- Empty-state hint on a blank block canvas (screen-centred, non-interactive)
         — mirrors the whiteboard/mind-map/flowchart prompts. -->
    <div
      v-if="blockEmpty"
      class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-center"
    >
      <div class="text-md font-medium text-ink-gray-4">Nothing here yet</div>
      <div class="mt-1 text-sm text-ink-gray-3">Click the + button below to add your first shape</div>
    </div>

    <!-- Rulers in screen space (outside the viewport <g>), shown while editing
         text at any zoom (spec §6). -->
    <Rulers />
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
