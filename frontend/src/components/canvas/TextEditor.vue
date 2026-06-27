<script setup>
// Inline text editor overlay (spec §6). Renders a <foreignObject> with a
// contentEditable aligned to the editing shape's text area at any zoom (it
// lives inside the viewport-transformed <g>, so logical units suffice). Text
// wraps, then auto-grows the shape vertically. Connector labels edit too.
// Commits through store.updateShape / store.updateConnector.
import { computed, nextTick, ref, watch } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { anchorPoint } from '@/diagram/geometry.js'
import { useTextEditing, shapeTextArea, textStyleCss, LINE_HEIGHT } from '@/composables/useTextEditing.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const editing = useTextEditing(store, editorUi)

const field = ref(null)

const shape = computed(() => (editing.editingShapeId.value ? store.shapeById(editing.editingShapeId.value) : null))
const connector = computed(() =>
  editing.editingConnectorId.value ? store.connectorById(editing.editingConnectorId.value) : null,
)

// Logical-unit rectangle the editable occupies.
const area = computed(() => (shape.value ? shapeTextArea(shape.value) : connectorArea.value))

const connectorArea = computed(() => {
  if (!connector.value) return null
  const a = resolve(connector.value.from)
  const b = resolve(connector.value.to)
  return { x: (a.x + b.x) / 2 - 60, y: (a.y + b.y) / 2 - 14, w: 120, h: 28 }
})

function resolve(endpoint) {
  if (endpoint?.shapeId) {
    const target = store.shapeById(endpoint.shapeId)
    if (target) return anchorPoint(target, endpoint.anchor || 'right')
  }
  return { x: endpoint?.x || 0, y: endpoint?.y || 0 }
}

// A blue inset ring marks the live edit region so an otherwise borderless text
// box (no fill, no stroke) is clearly visible while typing.
const EDIT_RING = { boxShadow: 'inset 0 0 0 1.5px #006EDB', borderRadius: '4px' }

const fieldStyle = computed(() => {
  if (shape.value) {
    const text = shape.value.text || {}
    return { ...textStyleCss(text.style, text.valign, text.align), ...EDIT_RING, padding: '4px 6px', height: '100%' }
  }
  return { ...textStyleCss({ size: 12 }, 'middle', 'center'), ...EDIT_RING, padding: '2px 8px', height: '100%' }
})

const currentText = computed(() =>
  shape.value ? shape.value.text?.content || '' : connector.value?.label || '',
)

// When a session starts, seed the field and place the caret at the end.
watch(
  () => [editing.editingShapeId.value, editing.editingConnectorId.value],
  async () => {
    if (!editing.isEditing.value) return
    await nextTick()
    if (!field.value) return
    field.value.textContent = currentText.value
    focusEnd(field.value)
    autoGrow()
  },
)

function focusEnd(element) {
  element.focus()
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

// Grow the shape's height so wrapped text never overflows (spec §6). Measured
// against the contentEditable's own scrollHeight in logical units.
function autoGrow() {
  if (!shape.value || !field.value) return
  const needed = field.value.scrollHeight
  const minimum = lineMinimum(shape.value)
  const target = Math.max(needed, minimum)
  if (target > shape.value.h) store.updateShape(shape.value.id, { h: growToFit(shape.value, target) })
}

// For inscribed shapes the box must grow more than the text area it gained.
function growToFit(s, areaHeight) {
  const factor = s.type === 'diamond' || s.type === 'triangle' ? 0.5 : 1
  return Math.ceil(areaHeight / factor) + 8
}

function lineMinimum(s) {
  const size = s.text?.style?.size || 16
  return Math.ceil(size * LINE_HEIGHT) + 8
}

function onInput() {
  autoGrow()
}

function commit() {
  if (shape.value) commitShape()
  else if (connector.value) commitConnector()
  editing.session.shapeId = null
  editing.session.connectorId = null
}

function commitShape() {
  const content = (field.value?.textContent || '').trim()
  // An empty text box carries nothing, so reject it on commit (text boxes only —
  // a labeled rectangle/ellipse left blank is still a real shape and stays).
  if (!content && shape.value.type === 'text') {
    store.removeShapes([shape.value.id])
    return
  }
  store.updateShape(shape.value.id, { text: { content } })
}

function commitConnector() {
  const label = (field.value?.textContent || '').trim()
  store.updateConnector(connector.value.id, { label })
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    commit()
  }
}
</script>

<template>
  <foreignObject
    v-if="editing.isEditing.value && area"
    data-text-editor
    :x="area.x"
    :y="area.y"
    :width="area.w"
    :height="area.h"
    :style="{ overflow: 'visible' }"
  >
    <div
      ref="field"
      contenteditable="true"
      spellcheck="false"
      class="outline-none"
      :style="fieldStyle"
      style="box-sizing: border-box; width: 100%; word-break: break-word; white-space: pre-wrap; cursor: text"
      @input="onInput"
      @keydown="onKeydown"
      @blur="commit"
      @pointerdown.stop
      @dblclick.stop
    />
  </foreignObject>
</template>
