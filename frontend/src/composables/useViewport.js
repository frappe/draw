// Pan + zoom for the diagram canvas (spec §7.7, build step 10).
// Tracks a translation (panX, panY) and a scale, exposing handlers for
// drag-to-pan and cursor-centered wheel zoom. Zoom is clamped 10%–400% and
// quantised to 10% steps. The canvas drives fit()/reset() via setMeasure().

import { reactive, readonly } from 'vue'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
const FIT_MARGIN = 48
// Wheel/pinch zoom is proportional to the scroll delta (a trackpad pinch fires
// many small-delta events per second, so a fixed 10% step per event zoomed far
// too fast). Lower = slower; the per-event factor is clamped so one big mouse
// notch can't lurch the zoom.
const ZOOM_WHEEL_SENSITIVITY = 0.0015
const ZOOM_WHEEL_MIN_FACTOR = 0.85
const ZOOM_WHEEL_MAX_FACTOR = 1.18

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
  // Container + content dimensions, set by the canvas so fit()/reset() can
  // compute. originX/originY are the content's top-left in logical units (0 for
  // the bounded paper + normalised mind map; the actual bbox corner for
  // flowchart/whiteboard, whose content lives at absolute coords).
  const measure = { containerW: 0, containerH: 0, canvasW: 1280, canvasH: 720, originX: 0, originY: 0 }

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

  // Set an exact zoom (e.g. a typed %), clamped but not snapped, centred on the
  // container.
  function setZoom(zoom) {
    zoomTo(clampZoom(zoom), measure.containerW / 2, measure.containerH / 2)
  }

  // Ctrl/Cmd or Shift + scroll zooms (cursor-centred, smooth + proportional to
  // the delta per §7.7); plain scroll pans (vertical deltaY, horizontal deltaX).
  function handleWheel(event, pointerX, pointerY) {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      // Shift+wheel may report the delta on deltaX in some browsers, so pick
      // whichever axis carries the gesture.
      const delta = event.deltaY || event.deltaX
      const factor = Math.min(
        ZOOM_WHEEL_MAX_FACTOR,
        Math.max(ZOOM_WHEEL_MIN_FACTOR, Math.exp(-delta * ZOOM_WHEEL_SENSITIVITY)),
      )
      zoomTo(state.zoom * factor, pointerX, pointerY)
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

  // Centre the content (top-left at originX/originY, size canvasW×canvasH) in the
  // container at the given scale.
  function centerAt(scale) {
    state.zoom = scale
    state.panX = (measure.containerW - measure.canvasW * scale) / 2 - measure.originX * scale
    state.panY = (measure.containerH - measure.canvasH * scale) / 2 - measure.originY * scale
  }

  // Fit the content into the container, centred, with a small margin. Never
  // magnifies past 100% — small content (e.g. a single mind-map root) stays
  // its natural size rather than ballooning to 400%.
  function fit() {
    if (!measure.containerW || !measure.containerH) return
    const scale = clampZoom(
      Math.min(
        (measure.containerW - FIT_MARGIN * 2) / measure.canvasW,
        (measure.containerH - FIT_MARGIN * 2) / measure.canvasH,
        1,
      ),
    )
    centerAt(scale)
  }

  // Frame a logical box centred horizontally with its top a fixed margin below
  // the viewport's top edge, at the current zoom. Used when adding the first
  // flowchart node so it sits high on screen and the node-type picker that opens
  // *below* it stays clear of the bottom palette.
  function placeTopCenter(box, topMargin = 96) {
    if (!measure.containerW || !measure.containerH) return
    const scale = state.zoom
    state.panX = measure.containerW / 2 - (box.x + box.w / 2) * scale
    state.panY = topMargin - box.y * scale
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
    setZoom,
    reset,
    fit,
    setPan,
    setMeasure,
    placeTopCenter,
  }
}
