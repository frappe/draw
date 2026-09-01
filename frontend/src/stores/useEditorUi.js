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
    // A "starter placement" armed from the catalog for click-to-place (#75): a mind
    // map ({ kind: 'mindmap' }) or a flowchart node ({ kind: 'flowchart', nodeType }).
    // A mind map / flowchart isn't a shape draw-type, so it rides in its own state
    // rather than overloading tool/drawShapeType. While set, the canvas shows the
    // placement cursor and the next click drops the starter's first node at the click
    // point. Cleared by placing it, by Escape, or by arming any other tool.
    pendingStarter: null,
    // Add-comment armed for click-to-place (#108), mirroring pendingStarter: while
    // true the canvas shows the comment cursor and the next click drops a comment
    // pin — on the shape under the pointer, or at the board point if it misses every
    // shape. Its own flag (not a tool) so it can be armed from any type without
    // disturbing the current tool. Cleared by placing, by Escape, or by arming a tool.
    pendingComment: false,
    // Whether the comments side panel (thread list) is open (#108).
    commentsPanelOpen: false,
    // Sticky latch: true once the user has armed any tool (draw shape, starter,
    // or comment) for the first time. Never reset back to false — the empty-block
    // nudge (#564) reads this to disappear for good on first arm, not just while
    // a tool stays armed.
    hasArmedTool: false,
    gridVisible: false,
    gridDensity: 'dense',
    // The canvas is an infinite surface by default (no fixed paper bounds).
    infiniteCanvas: true,
    // The selected section id (chrome — sections aren't part of shape selection).
    selectedSectionId: null,
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
// Arming any tool (select/hand/draw/…) also disarms a pending click-to-place
// starter, so the two arming models never both hold at once (#75).
function attachTools(ui, state) {
  ui.setTool = (tool) => {
    state.pendingStarter = null
    state.pendingComment = false
    state.tool = tool
    if (tool !== 'select') state.hasArmedTool = true
  }
  ui.setDrawShape = (type) => {
    state.pendingStarter = null
    state.pendingComment = false
    state.drawShapeType = type
    state.lastShapeType = type
    state.tool = 'draw'
    state.hasArmedTool = true
  }
  // Arm a mind-map / flowchart starter for click-to-place (#75). It is not a draw
  // shape type, so the tool drops back to select (no shape draft can start under it)
  // and the pending starter carries the intent; the canvas keys the placement cursor
  // and the drop-on-click off state.pendingStarter.
  ui.armStarter = (starter) => {
    state.tool = 'select'
    state.pendingComment = false
    state.pendingStarter = starter
    state.hasArmedTool = true
  }
  ui.clearStarter = () => (state.pendingStarter = null)

  // Arm add-comment click-to-place (#108). Like a starter it leaves the tool on
  // select and rides its own flag; arming it disarms a pending starter so the two
  // placement modes never both hold. Opening the panel too, so a placed comment's
  // thread is visible where it lands.
  ui.armComment = () => {
    state.tool = 'select'
    state.pendingStarter = null
    state.pendingComment = true
    state.commentsPanelOpen = true
    state.hasArmedTool = true
  }
  ui.clearComment = () => (state.pendingComment = false)
  ui.toggleCommentsPanel = () => {
    state.commentsPanelOpen = !state.commentsPanelOpen
    if (!state.commentsPanelOpen) state.pendingComment = false
  }
}

// Grid display (dots only — dragged shapes align via smart guides, not the grid).
function attachGrid(ui, state) {
  ui.toggleGrid = () => (state.gridVisible = !state.gridVisible)
  ui.setGridDensity = (density) => (state.gridDensity = density)
  ui.toggleInfiniteCanvas = () => (state.infiniteCanvas = !state.infiniteCanvas)
  ui.selectSection = (id) => (state.selectedSectionId = id)
  ui.clearSection = () => (state.selectedSectionId = null)
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
