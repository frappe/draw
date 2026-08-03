// Multi-click draw gesture for the freely-drawn polygon tool (issue #139). Arming
// the Polygon tool (editorUi tool 'draw' + drawShapeType 'polygon') enters a
// vertex-placement mode: each click drops a vertex and a rubber-band segment
// previews from the last vertex to the cursor.
//
// CLOSE the path by clicking near the first vertex (snap radius ~10 screen px), by
// double-click, or by pressing Enter. Escape cancels the in-progress polygon. A
// commit needs at least three vertices; on commit the polygon is created and
// selected, and the tool returns to select (the block draw convention).
//
// The pure geometry lives in diagram/polygon.js; this composable only owns the
// reactive in-progress state and the store/keyboard wiring. It cannot be fully
// unit-tested (the click stream + preview are DOM-driven), so the pure pieces it
// calls are tested instead — see polygon.test.js.

import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { buildPolygonShape, isNearFirstVertex } from '@/diagram/polygon.js'

// Click within this many SCREEN pixels of the first vertex to close the path. The
// snap distance is converted to canvas units with the live zoom so it feels the
// same at any magnification.
const CLOSE_SCREEN_RADIUS = 10

export function usePolygonCreation(store, editorUi) {
  const vertices = ref([])
  const cursor = ref(null)
  const isActive = computed(() => vertices.value.length > 0)

  // The snap radius in canvas units, and the epsilon that merges a double-click's
  // duplicate second press — both scaled by zoom so they track screen distance.
  const closeRadius = () => CLOSE_SCREEN_RADIUS / (editorUi.viewport.state.zoom || 1)
  const dedupeEpsilon = () => Math.max(1, closeRadius() * 0.4)

  // True while the cursor hovers the first vertex with enough points to close —
  // drives the snap ring in the preview.
  const nearFirst = computed(
    () => vertices.value.length >= 3 && isNearFirstVertex(cursor.value, vertices.value[0], closeRadius()),
  )

  // A click drops a vertex, unless it lands on the first vertex with enough points
  // placed — then it closes the path.
  function onPointerDown(point) {
    if (!armed()) return
    if (vertices.value.length >= 3 && isNearFirstVertex(point, vertices.value[0], closeRadius())) {
      return close()
    }
    vertices.value = [...vertices.value, point]
    cursor.value = point
  }

  function onPointerMove(point) {
    if (!armed() || !isActive.value) return
    cursor.value = point
  }

  // Finish the polygon: create + select the shape, then return to the select tool.
  // A run with fewer than three distinct vertices builds nothing, so a stray
  // double-click on empty canvas is a no-op rather than an invalid shape.
  function close() {
    const partial = buildPolygonShape(vertices.value, dedupeEpsilon())
    reset()
    if (!partial) return
    store.select(store.addShape(partial))
    editorUi.setTool('select')
  }

  function cancel() {
    reset()
  }

  function reset() {
    vertices.value = []
    cursor.value = null
  }

  function armed() {
    return editorUi.state.tool === 'draw' && editorUi.state.drawShapeType === 'polygon'
  }

  // Enter closes, Escape cancels — only while a polygon is in progress, so neither
  // key is stolen from the rest of the editor. (Escape also flips the tool back to
  // select via the global handler, which the watch below turns into a cancel; this
  // listener additionally covers Enter and makes Escape immediate.)
  function onKeydown(event) {
    if (!isActive.value) return
    if (event.key === 'Enter') {
      event.preventDefault()
      close()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

  // Disarming the tool — picking another tool, or Escape flipping back to select —
  // abandons any in-progress polygon so its preview never lingers.
  watch(armed, (isArmed) => {
    if (!isArmed) reset()
  })

  return { vertices, cursor, isActive, nearFirst, onPointerDown, onPointerMove, close, cancel }
}
