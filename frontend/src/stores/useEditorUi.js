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
    gridVisible: true,
    gridDensity: 'dense',
    formatPainter: { active: false, style: null },
  })
  return assembleUi(state, viewport)
}

function assembleUi(state, viewport) {
  const ui = reactive({ state, viewport })
  attachTools(ui, state)
  attachGrid(ui, state)
  attachZoom(ui, viewport)
  attachPainter(ui, state)
  return ui
}

// Switching to draw remembers the chosen shape so the tool can be re-armed.
function attachTools(ui, state) {
  ui.setTool = (tool) => (state.tool = tool)
  ui.setDrawShape = (type) => {
    state.drawShapeType = type
    state.lastShapeType = type
    state.tool = 'draw'
  }
}

function attachGrid(ui, state) {
  ui.toggleGrid = () => (state.gridVisible = !state.gridVisible)
  ui.setGridDensity = (density) => (state.gridDensity = density)
}

function attachZoom(ui, viewport) {
  ui.zoomPercent = computed(() => Math.round(viewport.state.zoom * 100))
  ui.fit = () => viewport.fit?.()
  ui.reset100 = () => viewport.reset()
}

function attachPainter(ui, state) {
  ui.toggleFormatPainter = (style = null) => {
    state.formatPainter.active = !state.formatPainter.active
    state.formatPainter.style = state.formatPainter.active ? style : null
  }
}

export function provideEditorUi(ui) {
  provide(UI_KEY, ui)
  return ui
}

export function useEditorUi() {
  return inject(UI_KEY)
}
