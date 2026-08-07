<script setup>
// One whiteboard table — rendered and edited with frappe-ui's Table (the same
// rich-text table Frappe Writer uses, #254), mounted inside a <foreignObject>
// over the SVG grid (spec diagram-types Part C9). The document lives in
// `table.content` (a Tiptap doc); row/column add-remove, merge/split and the
// header toggle come free from frappe-ui's EditorTableMenu. Selection/move
// stays surface-driven like the other whiteboard objects — the table owns its
// own press once selected (useWhiteboardInteraction's startTableMove).
import { computed, watch, nextTick } from 'vue'
import {
  useEditor,
  EditorContent,
  StarterKit,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TableNavigation,
  EditorTableMenu,
} from 'frappe-ui/editor'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { startTableMove } from '@/composables/useWhiteboardInteraction.js'
import { isAdditiveEvent } from '@/composables/pointer.js'
import { tableWidth, tableHeight } from '@/diagram/whiteboardModel.js'

const props = defineProps({
  table: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const ui = useWhiteboardUi()

const width = computed(() => tableWidth(props.table))
const height = computed(() => tableHeight(props.table))
const editing = computed(() => ui.state.editingCell?.tableId === props.table.id)

// Two-way bound to the store: an internal edit writes back here (useEditor's
// onUpdate), an external one (undo/redo, collaboration) flows back in.
// Reference-swapped, not patched — see store.updateTableContent.
const content = computed({
  get: () => props.table.content,
  set: (value) => store.updateTableContent(props.table.id, value),
})

// A cell holds plain paragraphs and nothing else. StarterKit is frappe-ui's way to
// reach Document/Paragraph/Text (it does not export them singly), so everything else
// it bundles is switched off. Two of those matter beyond tidiness: `undoRedo` would
// give the cell a second history stack fighting the canvas's own (stores/history.js),
// and `trailingNode` appends a paragraph after the table, which measure() would then
// bake into the object's height.
const TABLE_EXTENSIONS = [
  StarterKit.configure({
    blockquote: false,
    bold: false,
    bulletList: false,
    code: false,
    codeBlock: false,
    dropcursor: false,
    gapcursor: false,
    hardBreak: false,
    heading: false,
    horizontalRule: false,
    italic: false,
    link: false,
    listItem: false,
    listKeymap: false,
    orderedList: false,
    strike: false,
    trailingNode: false,
    underline: false,
    undoRedo: false,
  }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  TableNavigation,
]

const editor = useEditor({
  content,
  format: 'json',
  editable: editing,
  extensions: TABLE_EXTENSIONS,
  onUpdate: () => measure(),
})

// Grow/shrink the table's box to fit its rendered content: row/column count and
// per-cell sizing come from the editor now, not a fixed cols*cellW grid (#254).
function measure() {
  const dom = editor.value?.view?.dom
  if (!dom) return
  const w = Math.ceil(dom.scrollWidth)
  const h = Math.ceil(dom.scrollHeight)
  if (w && h && (w !== props.table.w || h !== props.table.h)) {
    store.updateTable(props.table.id, { w, h })
  }
}
nextTick(measure)

// A click on the selected table opens it for editing (startTableMove); focus
// the editor the moment that happens so typing lands immediately.
watch(editing, async (isEditing) => {
  if (!isEditing) return
  await nextTick()
  editor.value?.commands.focus()
})

// A press on the table (select tool only). Mirrors the sticky note: the first
// press and additive toggles fall through to the surface's selectAt, which
// single-selects/toggles the table; once selected WE own the press.
function onPointerDown(event) {
  if (event.button !== 0 || editorUi.state.tool !== 'select') return
  if (isAdditiveEvent(event) || !ui.isSelected('table', props.table.id)) return
  event.stopPropagation()
  startTableMove(event, store, editorUi, ui, props.table)
}
</script>

<template>
  <g :transform="`translate(${table.x} ${table.y})`">
    <rect
      :width="width"
      :height="height"
      fill="#FFFFFF"
      :stroke="table.color"
      stroke-width="1.5"
      :style="{
        cursor: 'move',
        filter: selected ? 'drop-shadow(0 0 2px #006EDB)' : null,
      }"
      @pointerdown="onPointerDown"
    />
    <foreignObject :width="width" :height="height" style="overflow: visible">
      <div class="fd-table" :style="{ color: table.color, pointerEvents: editing ? 'auto' : 'none' }">
        <EditorContent :editor="editor" />
      </div>
    </foreignObject>
    <EditorTableMenu v-if="editing" :editor="editor" />
  </g>
</template>

<style>
.fd-table { width: 100%; height: 100%; cursor: text; font-family: Inter, sans-serif; font-size: 14px; }
.fd-table .ProseMirror { outline: none; height: 100%; }
.fd-table table { width: 100%; height: 100%; table-layout: fixed; }
</style>
