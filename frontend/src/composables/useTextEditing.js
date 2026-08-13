// In-shape (and connector-label) text editing (spec §6). A module-level
// singleton so the canvas double-click handler and TextEditor overlay share
// one editing session without prop plumbing through DiagramCanvas.
// Geometry stays in logical canvas units; commits go through the store.

import { reactive, computed } from 'vue'
import { shapeCenter } from '@/diagram/geometry.js'

// The text area inside a shape. Diamonds/triangles use their inscribed
// rectangle so wrapped text never spills past the sloped edges (spec §6).
const INSCRIBED_FACTOR = { diamond: 0.5, triangle: 0.5 }
const INSCRIBED_PAD = 6
// Fixed left/right breathing room for text inside a shape, so a label never
// touches the shape's edges. Replaces the old ruler-driven adjustable inset.
const TEXT_PADDING = 12
const FONT_FAMILY = 'Inter, sans-serif'
// A casual, handwritten-feel stack (no web font needed) used by whiteboard text
// to read closer to TLDraw's hand-drawn style.
const HANDWRITTEN_FONT = "'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive"
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
  const session = reactive({ shapeId: null, connectorId: null, selectAll: false, seedIfEmpty: null })
  const api = { session, store, editorUi }
  attachEditingState(api, session)
  attachShapeEditing(api, session, store)
  attachConnectorEditing(api, session, store)
  return api
}

// Reactive readouts the overlay consumes.
function attachEditingState(api, session) {
  api.editingShapeId = computed(() => session.shapeId)
  api.editingConnectorId = computed(() => session.connectorId)
  api.isEditing = computed(() => Boolean(session.shapeId || session.connectorId))
}

function attachShapeEditing(api, session, store) {
  // opts.seedIfEmpty seeds a default label into an empty shape (e.g. "New idea" on a
  // freshly dropped node); opts.selectAll selects the seeded/existing text so the
  // first keystroke replaces it — the drop-to-type flow (#263).
  api.beginTextEdit = (shapeId, opts = {}) => {
    session.connectorId = null
    session.shapeId = shapeId
    session.selectAll = !!opts.selectAll
    session.seedIfEmpty = opts.seedIfEmpty || null
    store.select(shapeId)
  }
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
    return { x: shape.x + TEXT_PADDING, y: shape.y, w: Math.max(8, shape.w - TEXT_PADDING * 2), h: shape.h }
  }
  const w = Math.max(8, shape.w * factor - INSCRIBED_PAD * 2 - TEXT_PADDING * 2)
  const h = shape.h * factor - INSCRIBED_PAD * 2
  const center = shapeCenter(shape)
  return { x: center.x - w / 2, y: center.y - h / 2, w, h }
}

// CSS for the contentEditable, derived from the shape's text.style.
// A text element dropped straight onto the canvas, by double-clicking empty space
// or with the text tool (#418). It differs from a text box someone sizes by hand in
// one way, carried as `text.fitWidth`: it does not wrap. The box grows sideways as
// the words arrive and downwards only on a real newline, so its bounds stay wrapped
// around the text instead of standing off it — which is what a fixed 180×44 box did
// however few characters went in.
//
// Sized here for ONE empty line, and anchored so the caret lands where the pointer
// was rather than the box being centred on it.
export function canvasTextShape(point, style = {}) {
  const size = style.size || 16
  return {
    type: 'text',
    x: Math.round(point.x - TEXT_PADDING),
    y: Math.round(point.y - (size * LINE_HEIGHT) / 2),
    w: TEXT_PADDING * 2 + size,
    h: Math.ceil(size * LINE_HEIGHT) + 8,
    text: { content: '', align: 'left', valign: 'top', fitWidth: true, style: { size, ...style } },
  }
}

// Whether a shape's text hugs its content rather than wrapping inside a fixed box.
export function fitsWidthToText(shape) {
  return Boolean(shape?.text?.fitWidth)
}

export function textStyleCss(style = {}, valign = 'middle', align = 'center') {
  return {
    fontFamily: style.font || FONT_FAMILY,
    fontSize: `${style.size || 16}px`,
    lineHeight: String(LINE_HEIGHT),
    fontWeight: style.bold ? 700 : 500,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
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

export { LINE_HEIGHT, FONT_FAMILY, HANDWRITTEN_FONT }
