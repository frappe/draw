// Editor UI state (CONVENTIONS useEditorUi). Tool/draw mode, grid, the viewport
// (pan+zoom), zoom readout, and the format painter. Provided as 'editorUi';
// useEditorUi() injects it. Distinct from the document store — this is chrome.

import { reactive, computed, provide, inject } from 'vue'
import { useViewport } from '@/composables/useViewport.js'

const UI_KEY = 'editorUi'

export function createEditorUi() {
  const viewport = useViewport()
  const state = reactive({
    tool: 'select',
    drawShapeType: 'rectangle',
    lastShapeType: 'rectangle',
    gridVisible: false,
    gridDensity: 'dense',
    snapToGrid: false,
    // The canvas is an infinite surface by default (no fixed paper bounds).
    infiniteCanvas: true,
    // The selected section id (chrome — sections aren't part of shape selection).
    selectedSectionId: null,
    // Unified canvas: the frame being edited in focus mode ('mindmap'|'flowchart'
    // |null). While set, the editor behaves as that sub-model's single-type editor
    // (full node editing/keyboard/toolbar); "Back to canvas" clears it.
    focusedFrame: null,
    // True for a short window after a layout op (tidy / flip) so node positions
    // tween instead of jumping (spec 17.1). Off during free drag → no lag.
    animateLayout: false,
  })
  return assembleUi(state, viewport)
}

function assembleUi(state, viewport) {
  const ui = reactive({ state, viewport })
  attachTools(ui, state)
  attachGrid(ui, state)
  attachZoom(ui, viewport)
  // Pulse the layout-animation flag for one transition window (spec 17.1). A
  // token guards overlapping pulses so a later op doesn't end an earlier one early.
  let pulseToken = 0
  ui.pulseLayoutAnimation = () => {
    state.animateLayout = true
    const token = ++pulseToken
    setTimeout(() => {
      if (token === pulseToken) state.animateLayout = false
    }, 280)
  }
  return ui
}

// Switching to draw remembers the chosen shape so the tool can be re-armed.
function attachTools(ui, state) {
  ui.setTool = (tool) => (state.tool = tool)
  // Enter/leave a frame's focused single-type editing mode (unified canvas).
  ui.setFocusedFrame = (kind) => {
    state.focusedFrame = kind || null
    state.tool = 'select'
  }
  ui.setDrawShape = (type) => {
    state.drawShapeType = type
    state.lastShapeType = type
    state.tool = 'draw'
  }
}

// Grid display + snapping. The snap spacing matches the dots actually shown
// (dense = 24, sparse = 48) so snapped shapes land on the visible grid (spec 4.3).
const GRID_SPACING = { dense: 24, sparse: 48 }

function attachGrid(ui, state) {
  ui.toggleGrid = () => (state.gridVisible = !state.gridVisible)
  ui.setGridDensity = (density) => (state.gridDensity = density)
  ui.toggleSnapToGrid = () => (state.snapToGrid = !state.snapToGrid)
  ui.toggleInfiniteCanvas = () => (state.infiniteCanvas = !state.infiniteCanvas)
  ui.selectSection = (id) => (state.selectedSectionId = id)
  ui.clearSection = () => (state.selectedSectionId = null)
  ui.gridSpacing = computed(() => GRID_SPACING[state.gridDensity] || GRID_SPACING.dense)
}

function attachZoom(ui, viewport) {
  ui.zoomPercent = computed(() => Math.round(viewport.state.zoom * 100))
  // Fit-to-view must first refresh the per-type content bounds (mind-map tree /
  // flowchart / whiteboard bbox), which only the canvas knows. DiagramCanvas
  // registers that handler; without it we fall back to a bare viewport.fit()
  // (which would frame the stale default canvas, not the actual content — O9).
  let fitHandler = null
  ui.registerFit = (fn) => { fitHandler = fn }
  ui.fit = () => (fitHandler ? fitHandler() : viewport.fit?.())
  ui.reset100 = () => viewport.reset()
  // Set an exact zoom from a typed percentage (clamped 10–400%).
  ui.setZoomPercent = (percent) => {
    const value = Number(percent)
    if (Number.isFinite(value) && value > 0) viewport.setZoom(value / 100)
  }
}

export function provideEditorUi(ui) {
  provide(UI_KEY, ui)
  return ui
}

export function useEditorUi() {
  return inject(UI_KEY)
}
