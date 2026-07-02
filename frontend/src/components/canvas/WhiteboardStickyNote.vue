<script setup>
// One sticky note on the whiteboard (spec diagram-types C3/W4/W6). Renders inside
// the canvas viewport <g>, so geometry is in canvas units. Supports:
// - drag to move and a corner handle to resize (deltas divided by zoom so they
//   stay correct at any scale, Part G4);
// - inline text editing via a contentEditable foreignObject;
// - auto-contrast text color against the note fill (spec C3/C10);
// - an optional hyperlink (URL or another Frappe Draw diagram) that navigates on
//   click while the select tool is active (spec W6).
// All edits go through the store (one undoable unit each, Part G6).
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { contrastInk, STICKY_COLORS } from '@/diagram/whiteboardColors.js'
import { roughenRect, pointsToPath } from '@/diagram/sketch.js'

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
const selected = computed(
  () => ui.state.selected?.kind === 'sticky' && ui.state.selected.id === props.note.id,
)
const MIN = 80

// Author chip (Whimsical-style) + a floating contextual toolbar when selected.
const authorInitial = computed(() => (props.note.author || '?').trim().charAt(0).toUpperCase() || '?')
const stickyColors = STICKY_COLORS.slice(0, 6)
const toolbarStyle = computed(() => {
  const surface = document.querySelector('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
  const { panX, panY, zoom } = editorUi.viewport.state
  const cx = rect.left + panX + (props.note.x + props.note.w / 2) * zoom
  const top = rect.top + panY + props.note.y * zoom
  return { left: `${cx}px`, top: `${top - 10}px` }
})
function setColor(color) {
  store.updateStickyNote(props.note.id, { color })
}
function duplicate() {
  const id = store.addStickyNote(props.note.x + 16, props.note.y + 16, {
    color: props.note.color,
    text: props.note.text,
    author: props.note.author,
  })
  ui.selectSticky(id)
}
function removeSticky() {
  store.removeStickyNote(props.note.id)
  ui.clearSelection()
}

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
})

const sketchOutline = computed(() =>
  pointsToPath(roughenRect({ x: 0, y: 0, w: props.note.w, h: props.note.h }, 2, 11), true),
)

// A drag gesture shared by move (whole note) and resize (corner). The delta is
// converted from screen pixels to canvas units by dividing by the live zoom.
function startGesture(event, apply) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
  ui.selectSticky(props.note.id)
  const startX = event.clientX
  const startY = event.clientY
  const origin = { x: props.note.x, y: props.note.y, w: props.note.w, h: props.note.h }
  const move = (moveEvent) => {
    const zoom = editorUi.viewport.state.zoom
    apply(origin, (moveEvent.clientX - startX) / zoom, (moveEvent.clientY - startY) / zoom)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startMove(event) {
  if (props.note.hyperlink && !event.shiftKey) return // clicks navigate instead
  startGesture(event, (origin, dx, dy) =>
    store.updateStickyNote(props.note.id, { x: origin.x + dx, y: origin.y + dy }),
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

async function beginEdit(event) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
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

function commit() {
  if (!editing.value) return
  const text = (field.value?.textContent || '').trim()
  editing.value = false
  store.updateStickyNote(props.note.id, { text })
}

// Navigate a hyperlink on a plain click (select tool). Diagram links route within
// the SPA; URL links open in a new tab (spec W6).
function openLink(event) {
  const link = props.note.hyperlink
  if (!link || editorUi.state.tool !== 'select' || editing.value || event.shiftKey) return
  if (link.type === 'diagram') router.push({ name: 'Editor', params: { name: link.target } })
  else window.open(link.target, '_blank', 'noopener')
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
        :style="{
          color: ink,
          padding: '12px',
          boxSizing: 'border-box',
          fontFamily: 'Inter, sans-serif',
          fontSize: '15px',
          lineHeight: '1.35',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          cursor: editing ? 'text' : 'move',
        }"
        @dblclick="beginEdit"
        @pointerdown="editing ? null : startMove($event)"
        @blur="commit"
      ></div>
    </foreignObject>

    <!-- Hyperlink badge (spec W6). -->
    <g v-if="note.hyperlink" :transform="`translate(${note.w - 22} 8)`" style="cursor: pointer">
      <circle r="9" cx="7" cy="7" fill="#FFFFFF" stroke="#006EDB" stroke-width="1.2" />
      <path d="M4 7 a3 3 0 0 1 3 -3 M10 7 a3 3 0 0 1 -3 3" stroke="#006EDB" stroke-width="1.3" fill="none" stroke-linecap="round" transform="translate(0 0)" />
    </g>

    <!-- Author chip (who created it), bottom-left. -->
    <g v-if="note.author" :transform="`translate(12 ${note.h - 24})`" style="pointer-events: none">
      <circle cx="8" cy="8" r="8" :fill="ink" fill-opacity="0.16" />
      <text x="8" y="8" text-anchor="middle" dominant-baseline="central" font-size="8" font-weight="700" :fill="ink" font-family="Inter, sans-serif">{{ authorInitial }}</text>
      <text x="24" y="8" dominant-baseline="central" font-size="10" :fill="ink" fill-opacity="0.85" font-family="Inter, sans-serif">{{ note.author }}</text>
    </g>

    <!-- Floating contextual toolbar above the selected sticky (colour/duplicate/delete). -->
    <Teleport to="body">
      <div
        v-if="selected"
        class="fixed z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-lg border border-outline-gray-2 bg-surface-white p-1 shadow-lg"
        :style="toolbarStyle"
      >
        <button
          v-for="c in stickyColors"
          :key="c"
          class="h-5 w-5 rounded-full border border-black/10"
          :style="{ background: c }"
          :aria-label="`Colour ${c}`"
          @pointerdown.stop
          @click="setColor(c)"
        />
        <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />
        <button class="flex h-7 w-7 items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2" title="Duplicate" aria-label="Duplicate" @pointerdown.stop @click="duplicate">
          <LucideIcon name="copy" class="h-4 w-4" />
        </button>
        <button class="flex h-7 w-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50" title="Delete" aria-label="Delete" @pointerdown.stop @click="removeSticky">
          <LucideIcon name="trash-2" class="h-4 w-4" />
        </button>
      </div>
    </Teleport>

    <!-- Resize handle (bottom-right), shown when selected. -->
    <rect
      v-if="selected"
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
