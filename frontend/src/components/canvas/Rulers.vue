<script setup>
// Top + left rulers in screen space, shown while editing text (spec §6). They
// read the viewport transform so tick positions and labels stay correct at any
// zoom. Tick spacing in logical units adapts to keep screen gaps readable.
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { shapeTextArea } from '@/composables/useTextEditing.js'
import { mindmapUi } from '@/stores/mindmapUi.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const editorUi = useEditorUi()
const editing = useTextEditing()
const store = useDiagramStore()

// The block shape currently being edited (draggable ruler markers set its text
// insets). Null for non-shape editing (mind-map / flowchart / whiteboard).
const editedShape = computed(() => {
  const id = editing?.editingShapeId?.value || store.state.selection?.[0]
  const shape = id ? store.shapeById?.(id) : null
  return shape && typeof shape.w === 'number' ? shape : null
})

// Drag a top-ruler marker to set the edited shape's left/right text inset. Maps
// the pointer's window x into canvas units via the surface rect + viewport.
function startMarkerDrag(event, side) {
  const shape = editedShape.value
  if (!shape) return
  event.preventDefault()
  event.stopPropagation()
  const surface = document.querySelector('[data-fdpreset]')
  const rect = surface ? surface.getBoundingClientRect() : { left: 0 }
  const move = (e) => {
    const zoom = editorUi.viewport.state.zoom || 1
    const canvasX = (e.clientX - rect.left - editorUi.viewport.state.panX) / zoom
    if (side === 'left') {
      const insetLeft = Math.max(0, Math.min(shape.w - 16 - (shape.text?.insetRight || 0), canvasX - shape.x))
      store.updateShapes([shape.id], { text: { insetLeft: Math.round(insetLeft) } })
    } else {
      const insetRight = Math.max(0, Math.min(shape.w - 16 - (shape.text?.insetLeft || 0), shape.x + shape.w - canvasX))
      store.updateShapes([shape.id], { text: { insetRight: Math.round(insetRight) } })
    }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// Show while editing any text: shared text boxes/shapes (block + whiteboard) or a
// mind-map node. Rulers help line things up the moment you start typing (spec §6).
const shown = computed(
  () => props.visible || Boolean(editing?.isEditing.value) || Boolean(mindmapUi.editingId) || Boolean(editedShape.value),
)

const THICKNESS = 22
const MIN_TICK_GAP = 60 // minimum screen px between major ticks
// Explicit colours so the ruler reads clearly over the white canvas.
const RULER_BG = '#F1F1F4'
const RULER_BORDER = '1px solid #C7C7CE'
const TICK_LINE = '1px solid #9A9AA3'
const TICK_LINE_MINOR = '1px solid #CBCBD2'

// Logical units between major ticks, snapped to a 1/2/5 ladder so the on-screen
// gap never drops below MIN_TICK_GAP at the current zoom.
const step = computed(() => {
  const zoom = editorUi.viewport.state.zoom || 1
  const target = MIN_TICK_GAP / zoom
  const power = Math.pow(10, Math.floor(Math.log10(target)))
  for (const multiple of [1, 2, 5, 10]) {
    if (power * multiple >= target) return power * multiple
  }
  return power * 10
})

// Ticks at 1/5 of the major step: every 5th is a MAJOR tick (labelled, taller),
// the rest MINOR (short, unlabelled) — Google-Docs-style subdivisions (G2). Using
// an integer index keeps majors exactly on multiples of the step (0 is a major).
function buildTicks(panOffset, extent) {
  const zoom = editorUi.viewport.state.zoom || 1
  const minor = step.value / 5
  const firstIndex = Math.floor(-panOffset / zoom / minor)
  const lastIndex = Math.ceil((-panOffset + extent) / zoom / minor)
  const ticks = []
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const value = index * minor
    ticks.push({ value, screen: panOffset + value * zoom, major: index % 5 === 0 })
  }
  return ticks
}

const horizontalTicks = computed(() =>
  buildTicks(editorUi.viewport.state.panX, window.innerWidth),
)
const verticalTicks = computed(() =>
  buildTicks(editorUi.viewport.state.panY, window.innerHeight),
)

// Google-Docs-style para markers: while a text field is focused, track its
// on-screen left/right edges so the top ruler can mark where the text box begins
// and ends (updated each frame so they stay glued through pan/zoom/typing).
const editBounds = ref(null)
let raf = null
function trackEditor() {
  if (!shown.value) {
    raf = null
    editBounds.value = null
    return
  }
  const shape = editedShape.value
  if (shape) {
    // Derive marker positions from the shape's TEXT AREA geometry (not the live
    // editor element), so they persist while the shape is selected and follow
    // the inset as the marker is dragged — independent of edit focus.
    const area = shapeTextArea(shape)
    const surface = document.querySelector('[data-fdpreset]')
    const left = surface ? surface.getBoundingClientRect().left : 0
    const zoom = editorUi.viewport.state.zoom || 1
    const panX = editorUi.viewport.state.panX
    editBounds.value = {
      left: left + panX + area.x * zoom - THICKNESS,
      right: left + panX + (area.x + area.w) * zoom - THICKNESS,
    }
  } else {
    // Other editors (mind-map/flowchart/whiteboard text): read the focused
    // editable element's bounds — indicator markers only (not draggable).
    const el = document.activeElement
    const editable = el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))
    editBounds.value = editable
      ? (() => { const r = el.getBoundingClientRect(); return { left: r.left - THICKNESS, right: r.right - THICKNESS } })()
      : null
  }
  raf = requestAnimationFrame(trackEditor)
}
watch(
  shown,
  (on) => {
    if (on && raf == null) raf = requestAnimationFrame(trackEditor)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div v-if="shown" data-rulers class="pointer-events-none absolute inset-0">
    <!-- Top ruler -->
    <div
      class="absolute left-0 top-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      :style="{ height: THICKNESS + 'px', left: THICKNESS + 'px', right: 0, background: RULER_BG, borderBottom: RULER_BORDER }"
    >
      <div
        v-for="tick in horizontalTicks"
        :key="'h' + tick.value"
        class="absolute bottom-0"
        :class="tick.major ? 'h-2.5' : 'h-1.5'"
        :style="{ left: tick.screen - THICKNESS + 'px', borderLeft: tick.major ? TICK_LINE : TICK_LINE_MINOR }"
      />
      <!-- Labels sit inside the band (never clipped above it) and centre exactly
           on their major tick line — no horizontal offset. -->
      <span
        v-for="tick in horizontalTicks.filter((t) => t.major)"
        :key="'hl' + tick.value"
        class="absolute top-[2px] text-[10px] font-medium leading-none text-ink-gray-7"
        :style="{ left: tick.screen - THICKNESS + 'px', transform: 'translateX(-50%)' }"
      >{{ Math.round(tick.value) }}</span>

      <!-- Para start/end markers (Google-Docs style): blue triangles at the edited
           text box's left and right edges. Draggable (for a block shape) to set
           where the text sits inside the shape. -->
      <template v-if="editBounds">
        <div
          class="absolute bottom-0"
          :class="editedShape ? 'cursor-ew-resize' : ''"
          :style="{ left: editBounds.left + 'px', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #2563EB', pointerEvents: editedShape ? 'auto' : 'none' }"
          @mousedown.prevent
          @pointerdown="startMarkerDrag($event, 'left')"
        />
        <div
          class="absolute bottom-0"
          :class="editedShape ? 'cursor-ew-resize' : ''"
          :style="{ left: editBounds.right + 'px', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #2563EB', pointerEvents: editedShape ? 'auto' : 'none' }"
          @mousedown.prevent
          @pointerdown="startMarkerDrag($event, 'right')"
        />
      </template>
    </div>

    <!-- Left ruler -->
    <div
      class="absolute left-0 top-0 shadow-[1px_0_2px_rgba(0,0,0,0.06)]"
      :style="{ width: THICKNESS + 'px', top: THICKNESS + 'px', bottom: 0, background: RULER_BG, borderRight: RULER_BORDER }"
    >
      <div
        v-for="tick in verticalTicks"
        :key="'v' + tick.value"
        class="absolute right-0"
        :class="tick.major ? 'w-2.5' : 'w-1.5'"
        :style="{ top: tick.screen - THICKNESS + 'px', borderTop: tick.major ? TICK_LINE : TICK_LINE_MINOR }"
      />
      <!-- Labels centre vertically on their major tick line — same level as the
           dash, no vertical offset. -->
      <span
        v-for="tick in verticalTicks.filter((t) => t.major)"
        :key="'vl' + tick.value"
        class="absolute left-[2px] text-[10px] font-medium leading-none text-ink-gray-7"
        :style="{ top: tick.screen - THICKNESS + 'px', transform: 'translateY(-50%)' }"
      >{{ Math.round(tick.value) }}</span>
    </div>

    <!-- Corner square -->
    <div
      class="absolute left-0 top-0"
      :style="{ width: THICKNESS + 'px', height: THICKNESS + 'px', background: RULER_BG, borderBottom: RULER_BORDER, borderRight: RULER_BORDER }"
    />
  </div>
</template>
