// Pan + zoom for the diagram canvas (spec §7.7, build step 10).
// Tracks a translation (panX, panY) and a scale, exposing handlers for
// drag-to-pan and cursor-centered wheel zoom. Zoom is clamped 10%–400% and
// quantised to 10% steps. The canvas drives fit()/reset() via setMeasure().

import { reactive, readonly } from 'vue'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
const FIT_MARGIN = 48

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

// Snap a zoom value to the nearest 10% step within range.
function snapZoom(value) {
  return clampZoom(Math.round(value / ZOOM_STEP) * ZOOM_STEP)
}

export function useViewport() {
  const state = reactive({ panX: FIT_MARGIN, panY: FIT_MARGIN, zoom: 1 })
  const drag = { active: false, startX: 0, startY: 0, originX: 0, originY: 0 }
  // Container + canvas dimensions, set by the canvas so fit()/reset() can compute.
  const measure = { containerW: 0, containerH: 0, canvasW: 1280, canvasH: 720 }

  function startPan(event) {
    drag.active = true
    drag.startX = event.clientX
    drag.startY = event.clientY
    drag.originX = state.panX
    drag.originY = state.panY
  }

  function movePan(event) {
    if (!drag.active) return
    state.panX = drag.originX + (event.clientX - drag.startX)
    state.panY = drag.originY + (event.clientY - drag.startY)
  }

  function endPan() {
    drag.active = false
  }

  // Zoom toward (pointerX, pointerY) so the point under the cursor stays put.
  function zoomTo(nextZoom, pointerX, pointerY) {
    const next = clampZoom(nextZoom)
    const ratio = next / state.zoom
    state.panX = pointerX - (pointerX - state.panX) * ratio
    state.panY = pointerY - (pointerY - state.panY) * ratio
    state.zoom = next
  }

  // Step zoom by one 10% increment, centred on the container by default.
  function zoomStep(direction, pointerX, pointerY) {
    const px = pointerX ?? measure.containerW / 2
    const py = pointerY ?? measure.containerH / 2
    zoomTo(snapZoom(state.zoom + direction * ZOOM_STEP), px, py)
  }

  // Ctrl/Cmd or Shift + scroll zooms (cursor-centred, 10% steps per §7.7);
  // plain scroll pans (vertical via deltaY, horizontal via deltaX).
  function handleWheel(event, pointerX, pointerY) {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      // Shift+wheel may report the delta on deltaX in some browsers, so pick
      // whichever axis carries the gesture to decide zoom-in vs zoom-out.
      const delta = event.deltaY || event.deltaX
      zoomStep(delta < 0 ? 1 : -1, pointerX, pointerY)
    } else {
      state.panX -= event.deltaX
      state.panY -= event.deltaY
    }
  }

  // Imperatively set the translation (used to mirror native scrollbar movement
  // into the viewport so the canvas tracks the scroll position; spec §4.1/§7.7).
  function setPan(panX, panY) {
    state.panX = panX
    state.panY = panY
  }

  // Record container + canvas sizes used by fit()/reset() (spec §4.1).
  function setMeasure(next) {
    Object.assign(measure, next)
  }

  // Centre the canvas in the container at the given scale.
  function centerAt(scale) {
    state.zoom = scale
    state.panX = (measure.containerW - measure.canvasW * scale) / 2
    state.panY = (measure.containerH - measure.canvasH * scale) / 2
  }

  // Fit the paper into the container, centred, with a small margin.
  function fit() {
    if (!measure.containerW || !measure.containerH) return
    const scale = clampZoom(
      Math.min(
        (measure.containerW - FIT_MARGIN * 2) / measure.canvasW,
        (measure.containerH - FIT_MARGIN * 2) / measure.canvasH,
      ),
    )
    centerAt(scale)
  }

  // "100%" reset: snap to 1:1 and re-centre the canvas in the viewport.
  function reset() {
    if (measure.containerW && measure.containerH) return centerAt(1)
    state.panX = FIT_MARGIN
    state.panY = FIT_MARGIN
    state.zoom = 1
  }

  return {
    state: readonly(state),
    startPan,
    movePan,
    endPan,
    handleWheel,
    zoomStep,
    reset,
    fit,
    setPan,
    setMeasure,
  }
}
