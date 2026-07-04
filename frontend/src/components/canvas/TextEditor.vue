<script setup>
// Inline rich-text editor overlay (spec §6). A TipTap editor lives in a
// <foreignObject> aligned to the editing shape's text area at any zoom (it sits
// inside the viewport-transformed <g>, so logical units suffice). Gives multi-
// line text, bullet/ordered lists, bold/italic/underline and per-paragraph
// alignment. Commits store BOTH the HTML (rich render) and plain text (export
// fallback + empty check). Connector labels stay plain (label = the text).
//
// Editing ends — and commits — on a real blur or Escape. Right-palette text
// buttons use mousedown.prevent, so they don't steal focus and the editor keeps
// its selection while you format.
import { computed, nextTick, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { anchorPoint } from '@/diagram/geometry.js'
import { useTextEditing, shapeTextArea, textStyleCss, LINE_HEIGHT } from '@/composables/useTextEditing.js'
import { RICH_EXTENSIONS, setActiveEditor, clearActiveEditor, contentToHtml } from '@/composables/useRichText.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const editing = useTextEditing(store, editorUi)

const shape = computed(() => (editing.editingShapeId.value ? store.shapeById(editing.editingShapeId.value) : null))
const connector = computed(() =>
  editing.editingConnectorId.value ? store.connectorById(editing.editingConnectorId.value) : null,
)

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

const EDIT_RING = { boxShadow: 'inset 0 0 0 1.5px #006EDB', borderRadius: '4px' }
const fieldStyle = computed(() => {
  if (shape.value) {
    const text = shape.value.text || {}
    return { ...textStyleCss(text.style, text.valign, text.align), ...EDIT_RING, padding: '4px 6px', height: '100%' }
  }
  return { ...textStyleCss({ size: 12 }, 'middle', 'center'), ...EDIT_RING, padding: '2px 8px', height: '100%' }
})

const editor = useEditor({
  extensions: RICH_EXTENSIONS,
  content: '<p></p>',
  onUpdate: () => autoGrow(),
  onBlur: () => commit(),
})

// Seed the editor and focus when a session starts (target changed).
watch(
  () => [editing.editingShapeId.value, editing.editingConnectorId.value],
  async () => {
    if (!editing.isEditing.value || !editor.value) return
    const html = shape.value
      ? shape.value.text?.html || contentToHtml(shape.value.text?.content)
      : contentToHtml(connector.value?.label)
    editor.value.commands.setContent(html, false)
    setActiveEditor(editor.value)
    await nextTick()
    editor.value.commands.focus('end')
    autoGrow()
  },
)

// Grow the shape's height so wrapped/multi-line text never overflows (spec §6).
function autoGrow() {
  if (!shape.value || !editor.value) return
  const dom = editor.value.view?.dom
  if (!dom) return
  const needed = dom.scrollHeight + 10
  const minimum = lineMinimum(shape.value)
  const target = Math.max(needed, minimum)
  if (target > shape.value.h) store.updateShape(shape.value.id, { h: growToFit(shape.value, target) })
}

function growToFit(s, areaHeight) {
  const factor = s.type === 'diamond' || s.type === 'triangle' ? 0.5 : 1
  return Math.ceil(areaHeight / factor) + 8
}
function lineMinimum(s) {
  const size = s.text?.style?.size || 16
  return Math.ceil(size * LINE_HEIGHT) + 12
}

function commit() {
  if (!editing.isEditing.value) return
  if (shape.value) commitShape()
  else if (connector.value) commitConnector()
  clearActiveEditor(editor.value)
  editing.session.shapeId = null
  editing.session.connectorId = null
}

function commitShape() {
  const text = (editor.value?.getText() || '').trim()
  // An empty text box carries nothing, so reject it (text boxes only — a labeled
  // rectangle/ellipse left blank is still a real shape and stays).
  if (!text && shape.value.type === 'text') {
    store.removeShapes([shape.value.id])
    return
  }
  store.updateShape(shape.value.id, { text: { html: editor.value.getHTML(), content: text } })
}

function commitConnector() {
  store.updateConnector(connector.value.id, { label: (editor.value?.getText() || '').trim() })
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    editor.value?.commands.blur()
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
      class="fd-richtext outline-none"
      :style="fieldStyle"
      style="box-sizing: border-box; width: 100%; cursor: text"
      @keydown="onKeydown"
      @pointerdown.stop
      @dblclick.stop
    >
      <EditorContent :editor="editor" />
    </div>
  </foreignObject>
</template>

<style>
/* Rich-text content styling, shared by the editor and the on-canvas render.
   Tailwind's base reset strips list markers, so restore them explicitly. */
/* Wrap + break long words in BOTH the editor and the committed render, so text
   stays inside the shape and doesn't reflow/garble on blur (G3). */
.fd-richtext { overflow-wrap: break-word; word-break: break-word; white-space: normal; }
.fd-richtext .ProseMirror { outline: none; min-height: 1em; }
.fd-richtext p { margin: 0; }
.fd-richtext ul,
.fd-richtext ol { margin: 0; padding-left: 1.4em; list-style-position: outside; text-align: left; }
.fd-richtext ul { list-style-type: disc; }
.fd-richtext ol { list-style-type: decimal; }
.fd-richtext li { margin: 0; }
.fd-richtext li p { margin: 0; }
</style>
