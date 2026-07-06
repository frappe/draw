<script setup>
// Top + left rulers in screen space, shown while editing text (spec §6). They
// read the viewport transform so tick positions and labels stay correct at any
// zoom. Tick spacing in logical units adapts to keep screen gaps readable.
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useTextEditing } from '@/composables/useTextEditing.js'
import { mindmapUi } from '@/stores/mindmapUi.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const editorUi = useEditorUi()
const editing = useTextEditing()

// Show while editing any text: shared text boxes/shapes (block + whiteboard) or a
// mind-map node. Rulers help line things up the moment you start typing (spec §6).
const shown = computed(
  () => props.visible || Boolean(editing?.isEditing.value) || Boolean(mindmapUi.editingId),
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
  const el = document.activeElement
  const editable = el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))
  if (editable) {
    const r = el.getBoundingClientRect()
    // Positions within the top ruler band (which starts THICKNESS px from the left).
    editBounds.value = { left: r.left - THICKNESS, right: r.right - THICKNESS }
  } else {
    editBounds.value = null
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
           text box's left and right edges. -->
      <template v-if="editBounds">
        <div
          class="absolute bottom-0"
          :style="{ left: editBounds.left + 'px', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #2563EB' }"
        />
        <div
          class="absolute bottom-0"
          :style="{ left: editBounds.right + 'px', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '7px solid #2563EB' }"
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
