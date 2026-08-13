<script setup>
// One sticky note on the whiteboard (spec diagram-types C3/W4/W6). Renders inside
// the canvas viewport <g>, so geometry is in canvas units. Supports:
// - drag to move and a corner handle to resize (deltas divided by zoom so they
//   stay correct at any scale, Part G4);
// - inline PLAIN-TEXT editing via a contentEditable foreignObject (#416): Enter
//   inserts a real line break and continues a "- " list, a paste keeps only its
//   text, and the note grows so what was typed stays inside it;
// - auto-contrast text color against the note fill (spec C3/C10);
// - an optional hyperlink (URL or another Frappe Draw diagram) that navigates on
//   click while the select tool is active (spec W6).
// All edits go through the store (one undoable unit each, Part G6).
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { startGroupMove } from '@/composables/useWhiteboardInteraction.js'
// Shared drag flag (see useShapeTransform.js): hides this note's own floating
// toolbar while it's actively being dragged, not just while selected (#248).
import { isAdditiveEvent } from '@/composables/pointer.js'
import { safeHref } from '@/utils/safeUrl.js'
import { contrastInk } from '@/diagram/whiteboardColors.js'
import { roughenRect } from '@/diagram/sketch.js'
import { pointsToPath } from '@/diagram/svgPath.js'
import {
  newlineIntent,
  plainPaste,
  stickyTextHeight,
  STICKY_FONT_SIZE,
  STICKY_LINE_HEIGHT,
  STICKY_PAD_X,
  STICKY_PAD_Y,
} from '@/diagram/stickyText.js'

const props = defineProps({
  note: { type: Object, required: true },
  sketch: { type: Boolean, default: false },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const ui = useWhiteboardUi()
const router = useRouter()

const field = ref(null)
const editing = ref(false)

const ink = computed(() => contrastInk(props.note.color))
// The field is laid out with the same font, leading and padding the height
// measurement assumes, so a note that grew to fit its text really does fit it.
const fieldStyle = computed(() => ({
  color: ink.value,
  padding: `${STICKY_PAD_Y / 2}px ${STICKY_PAD_X / 2}px`,
  boxSizing: 'border-box',
  fontFamily: 'Inter, sans-serif',
  fontSize: `${STICKY_FONT_SIZE}px`,
  lineHeight: String(STICKY_LINE_HEIGHT),
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  textDecoration: props.note.strike ? 'line-through' : 'none',
  cursor: editing.value ? 'text' : 'move',
}))
// Highlighted whenever part of the selection (multi-select shows every member's
// border); `solo` (single-object) gates the resize handle so
// they don't clutter a multi-selection.
const selected = computed(() => ui.isSelected('sticky', props.note.id))
const solo = computed(
  () => ui.state.selected?.kind === 'sticky' && ui.state.selected.id === props.note.id,
)
const MIN = 80

// Keep the (non-editing) DOM text in sync with the model without interpolating
// inside the contentEditable, mirroring the shared TextEditor so user keystrokes
// are never clobbered by a re-render.
watch(
  () => props.note.text,
  (text) => {
    if (!editing.value && field.value) field.value.textContent = text || ''
  },
  { immediate: false },
)

onMounted(() => {
  if (field.value) field.value.textContent = props.note.text || ''
  // A sticky placed from the tool sets stickyEditRequest BEFORE this component
  // mounts, so the (non-immediate) watch below never observes it. Honour a
  // pending request on mount so a freshly-dropped note opens for typing.
  if (ui.state.stickyEditRequest === props.note.id) {
    ui.state.stickyEditRequest = null
    startEditing()
  }
})

const sketchOutline = computed(() =>
  pointsToPath(roughenRect({ x: 0, y: 0, w: props.note.w, h: props.note.h }, 2, 11), true),
)

// A drag gesture shared by move (whole note) and resize (corner). The delta is
// converted from screen pixels to canvas units by dividing by the live zoom.
let releaseGesture = null
// `track` marks this gesture as a body move (not a resize) so the floating
// toolbar can hide itself for the duration (#248) — resize leaves it showing,
// matching the block/flowchart/whiteboard toolbars, which only gate on move.
function startGesture(event, apply, { track = false } = {}) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
  ui.selectSticky(props.note.id)
  const startX = event.clientX
  const startY = event.clientY
  const origin = { x: props.note.x, y: props.note.y, w: props.note.w, h: props.note.h }
  const move = (moveEvent) => {
    // Any move while the pointer is down is a real drag (no separate threshold
    // here, matching startGroupMove).
    const zoom = editorUi.viewport.state.zoom
    apply(origin, (moveEvent.clientX - startX) / zoom, (moveEvent.clientY - startY) / zoom)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    releaseGesture = null
  }
  releaseGesture = up
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  // A pointercancel (a touch scroll claiming the gesture) or an unmount mid-drag
  // would otherwise leak these window listeners; end the gesture in both cases.
  window.addEventListener('pointercancel', up)
}
onBeforeUnmount(() => releaseGesture?.())

function startMove(event) {
  // Additive click toggles this note's membership without starting a drag.
  if (editorUi.state.tool === 'select' && isAdditiveEvent(event)) {
    event.stopPropagation()
    return ui.toggleSelected('sticky', props.note.id)
  }
  // Pressing a member of a multi-selection drags the whole group together.
  if (editorUi.state.tool === 'select' && !solo.value && ui.isSelected('sticky', props.note.id)) {
    return startGroupMove(event, store, editorUi, ui)
  }
  if (props.note.hyperlink && !event.shiftKey) return // clicks navigate instead
  startGesture(
    event,
    (origin, dx, dy) => store.updateStickyNote(props.note.id, { x: origin.x + dx, y: origin.y + dy }),
    { track: true },
  )
}

function startResize(event) {
  startGesture(event, (origin, dx, dy) =>
    store.updateStickyNote(props.note.id, {
      w: Math.max(MIN, origin.w + dx),
      h: Math.max(MIN, origin.h + dy),
    }),
  )
}

async function startEditing() {
  editing.value = true
  ui.selectSticky(props.note.id)
  await nextTick()
  if (!field.value) return
  field.value.textContent = props.note.text || ''
  field.value.focus()
  const range = document.createRange()
  range.selectNodeContents(field.value)
  range.collapse(false)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

async function beginEdit(event) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
  startEditing()
}

// A freshly-created sticky asks to open its editor immediately (so the cursor
// lands in it instead of the tool staying armed).
watch(
  () => ui.state.stickyEditRequest,
  (id) => {
    if (id === props.note.id) {
      ui.state.stickyEditRequest = null
      startEditing()
    }
  },
)

function commit() {
  if (!editing.value) return
  const text = fieldText()
  editing.value = false
  store.updateStickyNote(props.note.id, { text, h: fittedHeight(text) })
}

// innerText, NOT textContent (#416). Pressing Enter in a contentEditable makes the
// browser wrap each line in its own <div> — it does that here whatever the CSS says
// — and textContent concatenates those with nothing between them, so "First line /
// Second line" was saved as "First lineSecond line". innerText reports the text as
// it is laid out, line breaks included.
function fieldText() {
  return (field.value?.innerText || '').trim()
}

// Enter inserts the break itself (see newlineIntent) instead of leaving it to the
// browser, and carries a "- " list onto the next line.
function onKeydown(event) {
  if (event.key === 'Escape') return field.value?.blur()
  if (event.key !== 'Enter' || event.isComposing) return
  event.preventDefault()
  const intent = newlineIntent(lineBeforeCaret())
  deleteBeforeCaret(intent.deleteBefore)
  if (intent.insert) document.execCommand('insertText', false, intent.insert)
  growToText(fieldText())
}

// Paste as plain text: a note holds a string, so pasted markup has nothing to be
// pasted into. insertText leaves the DOM and the undo stack to the browser.
function onPaste(event) {
  event.preventDefault()
  document.execCommand('insertText', false, plainPaste(event.clipboardData?.getData('text/plain')))
  growToText(fieldText())
}

// The text of the line the caret is on, up to the caret. Read from the caret's own
// block (the <div> the browser made for that line, or the field itself for the
// first one), because a Range spanning several blocks reports their text with the
// breaks between them missing. A note opened for editing starts as ONE text node
// carrying real newlines, so the last break inside the block still decides where
// the line begins.
function lineBeforeCaret() {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !field.value) return ''
  const range = selection.getRangeAt(0).cloneRange()
  range.setStart(blockOf(range.startContainer), 0)
  const text = range.toString()
  return text.slice(text.lastIndexOf('\n') + 1)
}

function blockOf(node) {
  const root = field.value
  let current = node
  while (current && current.parentNode !== root) current = current.parentNode
  return current?.nodeType === 1 ? current : root
}

// Take `count` characters back from the caret — the "- " marker being cleared when
// a list ends.
function deleteBeforeCaret(count) {
  if (!count) return
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  range.setStart(range.startContainer, Math.max(0, range.startOffset - count))
  selection.removeAllRanges()
  selection.addRange(range)
  document.execCommand('delete')
}

// Grow the note so the text stays inside it. Growth only: a note the user made
// taller keeps that height, and deleting text does not yank the box in under the
// pointer.
//
// The growth is not recorded — the same preview-then-commit shape startGroupMove
// uses. A history step per line would leave the undo stack holding half-typed
// notes; commit() records the final text and height together as one step.
function growToText(text) {
  store.growStickyNote(props.note.id, fittedHeight(text))
}

function fittedHeight(text) {
  return Math.max(props.note.h, MIN, stickyTextHeight(text, { width: props.note.w }))
}

// Navigate a hyperlink on a plain click (select tool). Diagram links route within
// the SPA; URL links open in a new tab (spec W6).
function openLink(event) {
  const link = props.note.hyperlink
  if (!link || editorUi.state.tool !== 'select' || editing.value || event.shiftKey) return
  if (link.type === 'diagram') router.push({ name: 'Editor', params: { name: link.target } })
  else {
    // Untrusted document target — only open a safe scheme, so a crafted
    // javascript:/data: link on a shared sticky can't run on click.
    const href = safeHref(link.target)
    if (href) window.open(href, '_blank', 'noopener')
  }
}
</script>

<template>
  <g :transform="`translate(${note.x} ${note.y})`" @click="openLink">
    <rect
      v-if="!sketch"
      :width="note.w"
      :height="note.h"
      rx="4"
      :fill="note.color"
      :stroke="selected ? '#006EDB' : 'rgba(0,0,0,0.08)'"
      :stroke-width="selected ? 1.5 : 1"
      style="cursor: move; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.12))"
      @pointerdown="startMove"
    />
    <g v-else style="cursor: move" @pointerdown="startMove">
      <rect :width="note.w" :height="note.h" rx="4" :fill="note.color" />
      <path :d="sketchOutline" fill="none" :stroke="selected ? '#006EDB' : 'rgba(0,0,0,0.35)'" stroke-width="1.5" />
    </g>

    <!-- Editable text (auto-contrast ink). -->
    <foreignObject :width="note.w" :height="note.h" style="overflow: visible">
      <div
        ref="field"
        :contenteditable="editing"
        spellcheck="false"
        class="h-full w-full outline-none"
        :style="fieldStyle"
        @dblclick="beginEdit"
        @pointerdown="editing ? null : startMove($event)"
        @keydown="onKeydown"
        @paste="onPaste"
        @input="growToText(fieldText())"
        @blur="commit"
      ></div>
    </foreignObject>

    <!-- Hyperlink badge (spec W6). -->
    <g v-if="note.hyperlink" :transform="`translate(${note.w - 22} 8)`" style="cursor: pointer">
      <circle r="9" cx="7" cy="7" fill="#FFFFFF" stroke="#006EDB" stroke-width="1.2" />
      <path d="M4 7 a3 3 0 0 1 3 -3 M10 7 a3 3 0 0 1 -3 3" stroke="#006EDB" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(0 0)" />
    </g>

    <!-- Resize handle (bottom-right), shown only for a lone selection. -->
    <rect
      v-if="solo"
      :x="note.w - 12"
      :y="note.h - 12"
      width="12"
      height="12"
      fill="#FFFFFF"
      stroke="#006EDB"
      stroke-width="1.5"
      style="cursor: nwse-resize"
      @pointerdown="startResize"
    />
  </g>
</template>
