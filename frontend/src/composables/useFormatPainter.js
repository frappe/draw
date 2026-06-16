// Format painter: copy all formatting from one shape and apply it to the next
// clicked shape(s) (spec §4.3). The copied style lives on editorUi.formatPainter
// so the canvas-click handler and the right palette share one source of truth.

// The set of keys that count as "formatting" (geometry/text content excluded).
const FORMAT_KEYS = ['fill', 'border', 'opacity']

export function useFormatPainter(store, editorUi) {
  return {
    copyFrom: (shapeId) => copyFrom(store, editorUi, shapeId),
    applyTo: (shapeId) => applyTo(store, editorUi, shapeId),
    isActive: () => editorUi.state.formatPainter.active,
    cancel: () => cancel(editorUi),
  }
}

// Snapshot a shape's formatting and arm the painter with it.
function copyFrom(store, editorUi, shapeId) {
  const shape = store.shapeById(shapeId)
  if (!shape) return
  editorUi.toggleFormatPainter(extractStyle(shape))
}

// Pull the formatting keys (plus text style) out of a shape as a fresh patch.
function extractStyle(shape) {
  const style = {}
  for (const key of FORMAT_KEYS) style[key] = clone(shape[key])
  style.text = { style: clone(shape.text?.style || {}) }
  return style
}

// Apply the armed style to a shape; the painter stays on for repeated clicks.
function applyTo(store, editorUi, shapeId) {
  const style = editorUi.state.formatPainter.style
  if (!style || !store.shapeById(shapeId)) return false
  store.updateShapes([shapeId], clone(style))
  return true
}

function cancel(editorUi) {
  if (editorUi.state.formatPainter.active) editorUi.toggleFormatPainter()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
