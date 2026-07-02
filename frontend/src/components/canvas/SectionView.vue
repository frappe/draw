<script setup>
// A named section/frame, rendered inside the canvas viewport <g> (canvas units)
// so it works identically in every diagram type. Drawn BEHIND content; only its
// title strip + resize handle are interactive, so clicking inside still reaches
// the content it groups. Title bar drags it; double-click the title to rename;
// a resize handle + delete button show when selected. Edits go through the store
// (one undoable unit each); drag deltas divide by zoom (Part G4).
import { ref, watch, onMounted, nextTick } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { SECTION_HEADER_H } from '@/diagram/sections.js'

const props = defineProps({
  section: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

const store = useDiagramStore()
const editorUi = useEditorUi()

const field = ref(null)
const editing = ref(false)
const MIN = 80
const headerH = SECTION_HEADER_H

watch(
  () => props.section.title,
  (title) => {
    if (!editing.value && field.value) field.value.textContent = title || ''
  },
)
onMounted(() => {
  if (field.value) field.value.textContent = props.section.title || ''
})

function startGesture(event, apply) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
  editorUi.selectSection(props.section.id)
  const startX = event.clientX
  const startY = event.clientY
  const o = { x: props.section.x, y: props.section.y, w: props.section.w, h: props.section.h }
  const move = (e) => {
    const zoom = editorUi.viewport.state.zoom
    apply(o, (e.clientX - startX) / zoom, (e.clientY - startY) / zoom)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function startMove(event) {
  startGesture(event, (o, dx, dy) => store.updateSection(props.section.id, { x: o.x + dx, y: o.y + dy }))
}
function startResize(event) {
  startGesture(event, (o, dx, dy) =>
    store.updateSection(props.section.id, { w: Math.max(MIN, o.w + dx), h: Math.max(MIN, o.h + dy) }),
  )
}

async function beginEdit(event) {
  event.stopPropagation()
  if (editorUi.state.tool !== 'select') return
  editing.value = true
  editorUi.selectSection(props.section.id)
  await nextTick()
  if (!field.value) return
  field.value.textContent = props.section.title || ''
  field.value.focus()
  const range = document.createRange()
  range.selectNodeContents(field.value)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}
function commit() {
  if (!editing.value) return
  const title = (field.value?.textContent || '').trim() || 'Section'
  editing.value = false
  store.updateSection(props.section.id, { title })
}
function remove() {
  editorUi.clearSection()
  store.removeSection(props.section.id)
}
</script>

<template>
  <g :transform="`translate(${section.x} ${section.y})`">
    <!-- Body: outlined, faint tint, NON-interactive so content stays clickable. -->
    <rect
      :width="section.w"
      :height="section.h"
      rx="6"
      fill="rgba(110,86,207,0.035)"
      :stroke="selected ? '#006EDB' : section.color"
      :stroke-width="selected ? 2 : 1.5"
      style="pointer-events: none"
    />
    <!-- Title strip: grab handle (drag to move, double-click to rename). -->
    <rect
      :width="section.w"
      :height="headerH"
      rx="6"
      :fill="section.color"
      style="cursor: move"
      @pointerdown="startMove"
      @dblclick="beginEdit"
    />
    <rect :y="headerH - 6" :width="section.w" height="6" :fill="section.color" style="pointer-events: none" />
    <foreignObject :width="section.w - (selected ? 44 : 16)" :height="headerH" x="8" style="overflow: visible">
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

    <!-- Delete (shown when selected), in the title strip's right end. -->
    <g
      v-if="selected"
      :transform="`translate(${section.w - 18} ${headerH / 2})`"
      style="cursor: pointer"
      @pointerdown.stop
      @click.stop="remove"
    >
      <circle r="9" fill="rgba(255,255,255,0.15)" />
      <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round" />
    </g>

    <!-- Resize handle (bottom-right), shown when selected. -->
    <rect
      v-if="selected"
      :x="section.w - 12"
      :y="section.h - 12"
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
