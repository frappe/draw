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
import {
  useTextEditing,
  shapeTextArea,
  textStyleCss,
  fitsWidthToText,
  LINE_HEIGHT,
} from '@/composables/useTextEditing.js'
import { textWidth, lineCount } from '@/diagram/textMetrics.js'
import { RICH_EXTENSIONS, setActiveEditor, clearActiveEditor, contentToHtml } from '@/composables/useRichText.js'
import { sanitizeRichText } from '@/utils/sanitizeHtml.js'

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
// Room either side of the measured text, so the caret at the end of a line is not
// flush against the edge of the box.
const TEXT_FIT_PADDING = 16

const fieldStyle = computed(() => {
  if (shape.value) {
    const text = shape.value.text || {}
    const nowrap = fitsWidthToText(shape.value) ? { whiteSpace: 'pre' } : {}
    return {
      ...textStyleCss(text.style, text.valign, text.align),
      ...EDIT_RING,
      ...nowrap,
      padding: '4px 6px',
      height: '100%',
    }
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
    // Sanitised on the way in as well as on the way out (ShapeView): TipTap's schema
    // would drop unknown nodes anyway, but editing a shared shape should not be the
    // one path where unsanitised markup from someone else's document is parsed.
    let html = shape.value
      ? sanitizeRichText(shape.value.text?.html) || contentToHtml(shape.value.text?.content)
      : contentToHtml(connector.value?.label)
    // Seed a default label into an empty shape (e.g. "New idea" on a dropped node),
    // then select it below so the first keystroke replaces it — drop-to-type (#263).
    if (shape.value && !shape.value.text?.content && editing.session.seedIfEmpty) {
      html = contentToHtml(editing.session.seedIfEmpty)
    }
    editor.value.commands.setContent(html, false)
    setActiveEditor(editor.value)
    await nextTick()
    editor.value.commands.focus('end')
    if (editing.session.selectAll) editor.value.commands.selectAll()
    autoGrow()
  },
)

// Grow the shape so wrapped/multi-line text never overflows (spec §6).
//
// A canvas text element also grows SIDEWAYS (#418): it does not wrap, so the box
// tracks the words as they arrive instead of standing off them inside a fixed
// width. Everything else keeps wrapping at its own width and grows down only —
// a shape's label has a box to live in, and widening a rectangle because someone
// typed into it would move the diagram around them.
function autoGrow() {
  if (!shape.value || !editor.value) return
  if (fitsWidthToText(shape.value)) return fitBoxToText()
  const dom = editor.value.view?.dom
  if (!dom) return
  const needed = dom.scrollHeight + 10
  const target = Math.max(needed, lineMinimum(shape.value))
  if (target > shape.value.h) store.updateShape(shape.value.id, { h: growToFit(shape.value, target) })
}

// Size a canvas text element to its content, both ways (#418).
//
// Measured against the FONT rather than off the live field. The field is laid out
// inside the box being sized, so its `scrollWidth` is bounded by the number it is
// meant to produce, and ProseMirror's own `white-space: pre-wrap` wraps anything
// longer — which sent the width down to its padding and the height into the
// hundreds. `chrome` is the inset between the shape and its text area, added back
// so the text gets the width it measured.
function fitBoxToText() {
  const text = editor.value.getText()
  const style = shape.value.text?.style || {}
  const chrome = shape.value.w - shapeTextArea(shape.value).w
  const width = Math.ceil(textWidth(text, style)) + TEXT_FIT_PADDING + chrome
  const height = Math.ceil(lineCount(text) * (style.size || 16) * LINE_HEIGHT) + 8
  if (width === shape.value.w && height === shape.value.h) return
  store.updateShape(shape.value.id, { w: width, h: height })
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
    return
  }
  // #263: Cmd/Ctrl+Enter adds a newline in the same box too — plain Enter already
  // does, so both keep typing multi-line instead of committing.
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    editor.value?.chain().focus().splitBlock().run()
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
      :data-fit-width="shape && fitsWidthToText(shape) ? '' : undefined"
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
/* A canvas text element (#418) is sized to its own text, so it must not wrap —
   ProseMirror sets white-space: pre-wrap on itself, which would re-flow it inside
   the box it was just measured for. */
.fd-richtext[data-fit-width] { white-space: pre; overflow-wrap: normal; word-break: normal; }
.fd-richtext[data-fit-width] .ProseMirror { white-space: pre; }
.fd-richtext .ProseMirror { outline: none; min-height: 1em; }
.fd-richtext p { margin: 0; }
.fd-richtext ul,
.fd-richtext ol { margin: 0; padding-left: 1.4em; list-style-position: outside; text-align: left; }
.fd-richtext ul { list-style-type: disc; }
.fd-richtext ol { list-style-type: decimal; }
.fd-richtext li { margin: 0; }
.fd-richtext li p { margin: 0; }
</style>
