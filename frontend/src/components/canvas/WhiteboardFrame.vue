<script setup>
// A titled frame / section on the whiteboard (spec 15.3). Drawn BEHIND all other
// content; only its title strip and resize handle are interactive, so clicking
// inside the frame still reaches the content it groups. The title bar drags the
// whole frame; double-click the title to rename. Geometry is in canvas units, so
// drag deltas are divided by zoom (Part G4). Edits go through the store (undoable).
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { isAdditive, startGroupMove } from '@/composables/useWhiteboardInteraction.js'
import { FRAME_HEADER_H } from '@/diagram/whiteboardModel.js'

const props = defineProps({
  frame: { type: Object, required: true },
  // Passed from the layer via ui.isSelected → true for every selected frame.
  selected: { type: Boolean, default: false },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const ui = useWhiteboardUi()

// Single-object affordances (the resize handle) show only for a lone selection.
const solo = computed(
  () => ui.state.selected?.kind === 'frame' && ui.state.selected.id === props.frame.id,
)

const field = ref(null)
const editing = ref(false)
const MIN = 80
const headerH = FRAME_HEADER_H

watch(
  () => props.frame.title,
  (title) => {
    if (!editing.value && field.value) field.value.textContent = title || ''
  },
)
onMounted(() => {
  if (field.value) field.value.textContent = props.frame.title || ''
})

function startGesture(event, apply) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
  ui.selectFrame(props.frame.id)
  const startX = event.clientX
  const startY = event.clientY
  const origin = { x: props.frame.x, y: props.frame.y, w: props.frame.w, h: props.frame.h }
  const move = (e) => {
    const zoom = editorUi.viewport.state.zoom
    apply(origin, (e.clientX - startX) / zoom, (e.clientY - startY) / zoom)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startMove(event) {
  // Additive click toggles this frame's membership without starting a drag.
  if (editorUi.state.tool === 'select' && isAdditive(event)) {
    event.stopPropagation()
    return ui.toggleSelected('frame', props.frame.id)
  }
  // Pressing a member of a multi-selection drags the whole group together.
  if (editorUi.state.tool === 'select' && !solo.value && ui.isSelected('frame', props.frame.id)) {
    return startGroupMove(event, store, editorUi, ui)
  }
  startGesture(event, (o, dx, dy) => store.updateFrame(props.frame.id, { x: o.x + dx, y: o.y + dy }))
}
function startResize(event) {
  startGesture(event, (o, dx, dy) =>
    store.updateFrame(props.frame.id, { w: Math.max(MIN, o.w + dx), h: Math.max(MIN, o.h + dy) }),
  )
}

async function beginEdit(event) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
  editing.value = true
  ui.selectFrame(props.frame.id)
  await nextTick()
  if (!field.value) return
  field.value.textContent = props.frame.title || ''
  field.value.focus()
  const range = document.createRange()
  range.selectNodeContents(field.value)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}
function commit() {
  if (!editing.value) return
  const title = (field.value?.textContent || '').trim() || 'Frame'
  editing.value = false
  store.updateFrame(props.frame.id, { title })
}

const headerFill = computed(() => props.frame.color || '#6E56CF')
</script>

<template>
  <g :transform="`translate(${frame.x} ${frame.y})`">
    <!-- Body: outlined, faint tint, NON-interactive so content stays clickable. -->
    <rect
      :width="frame.w"
      :height="frame.h"
      rx="6"
      fill="rgba(110,86,207,0.04)"
      :stroke="selected ? '#006EDB' : headerFill"
      :stroke-width="selected ? 2 : 1.5"
      style="pointer-events: none"
    />
    <!-- Title strip: the grab handle (drag to move, double-click to rename). -->
    <rect
      :width="frame.w"
      :height="headerH"
      rx="6"
      :fill="headerFill"
      style="cursor: move"
      @pointerdown="startMove"
      @dblclick="beginEdit"
    />
    <rect :y="headerH - 6" :width="frame.w" height="6" :fill="headerFill" style="pointer-events: none" />
    <foreignObject :width="frame.w - 16" :height="headerH" x="8" style="overflow: visible">
      <div
        ref="field"
        :contenteditable="editing"
        spellcheck="false"
        class="outline-none"
        :style="{
          color: '#FFFFFF',
          height: headerH + 'px',
          lineHeight: headerH + 'px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          cursor: editing ? 'text' : 'move',
        }"
        @dblclick="beginEdit"
        @pointerdown="editing ? null : startMove($event)"
        @blur="commit"
      ></div>
    </foreignObject>

    <!-- Resize handle (bottom-right), shown only for a lone selection. -->
    <rect
      v-if="solo"
      :x="frame.w - 12"
      :y="frame.h - 12"
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
