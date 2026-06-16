// In-shape (and connector-label) text editing (spec §6). A module-level
// singleton so the canvas double-click handler, TextEditor overlay, and Rulers
// share one editing session without prop plumbing through DiagramCanvas.
// Geometry stays in logical canvas units; commits go through the store.

import { reactive, computed } from 'vue'
import { shapeCenter } from '@/diagram/geometry.js'

// The text area inside a shape. Diamonds/triangles use their inscribed
// rectangle so wrapped text never spills past the sloped edges (spec §6).
const INSCRIBED_FACTOR = { diamond: 0.5, triangle: 0.5 }
const INSCRIBED_PAD = 6
const FONT_FAMILY = 'Inter, sans-serif'
const LINE_HEIGHT = 1.3

let singleton = null

export function useTextEditing(store, editorUi) {
  // Re-bind to a fresh store when EditorShell mounts a new diagram; readers
  // that pass no args keep sharing whatever session is active.
  if (store && (!singleton || singleton.store !== store)) {
    singleton = createTextEditing(store, editorUi)
  }
  return singleton
}

function createTextEditing(store, editorUi) {
  const session = reactive({ shapeId: null, connectorId: null })
  const api = { session, store, editorUi }
  attachEditingState(api, session)
  attachShapeEditing(api, session, store, editorUi)
  attachConnectorEditing(api, session, store)
  return api
}

// Reactive readouts the overlay + Rulers consume.
function attachEditingState(api, session) {
  api.editingShapeId = computed(() => session.shapeId)
  api.editingConnectorId = computed(() => session.connectorId)
  api.isEditing = computed(() => Boolean(session.shapeId || session.connectorId))
}

function attachShapeEditing(api, session, store, editorUi) {
  api.beginTextEdit = (shapeId) => {
    session.connectorId = null
    session.shapeId = shapeId
    store.select(shapeId)
  }
  // Double-click on empty canvas: spawn the last-used (or rectangle) shape at
  // the point, already in edit mode (spec §7.1).
  api.beginEmptyCanvasCreate = (point) => createAndEdit(api, store, editorUi, point)
}

function createAndEdit(api, store, editorUi, point) {
  const type = editorUi?.state?.lastShapeType || 'rectangle'
  const w = 180
  const h = 96
  const id = store.addShape({ type, x: point.x - w / 2, y: point.y - h / 2, w, h })
  api.beginTextEdit(id)
  return id
}

function attachConnectorEditing(api, session, store) {
  api.beginConnectorLabelEdit = (connectorId) => {
    session.shapeId = null
    session.connectorId = connectorId
    store.select(connectorId)
  }
}

// The logical-unit text area for the shape being edited (inscribed for
// diamonds/triangles). Returns null when no shape is editing.
export function shapeTextArea(shape) {
  if (!shape) return null
  const factor = INSCRIBED_FACTOR[shape.type]
  if (!factor) {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
  }
  const w = shape.w * factor - INSCRIBED_PAD * 2
  const h = shape.h * factor - INSCRIBED_PAD * 2
  return { x: shapeCenter(shape).x - w / 2, y: shapeCenter(shape).y - h / 2, w, h }
}

// CSS for the contentEditable, derived from the shape's text.style.
export function textStyleCss(style = {}, valign = 'middle', align = 'center') {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${style.size || 16}px`,
    lineHeight: String(LINE_HEIGHT),
    fontWeight: style.bold ? 700 : 500,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    color: style.color || '#171717',
    textAlign: align,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: justifyFor(valign),
  }
}

function justifyFor(valign) {
  if (valign === 'top') return 'flex-start'
  if (valign === 'bottom') return 'flex-end'
  return 'center'
}

export { LINE_HEIGHT, FONT_FAMILY }
