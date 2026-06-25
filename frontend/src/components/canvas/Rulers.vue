<script setup>
// Top + left rulers in screen space, shown while editing text (spec §6). They
// read the viewport transform so tick positions and labels stay correct at any
// zoom. Tick spacing in logical units adapts to keep screen gaps readable.
import { computed } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useTextEditing } from '@/composables/useTextEditing.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const editorUi = useEditorUi()
const editing = useTextEditing()

const shown = computed(() => props.visible || Boolean(editing?.isEditing.value))

const THICKNESS = 24
const MIN_TICK_GAP = 60 // minimum screen px between major ticks
const TICK_LINE = '1px solid #B6B6BD' // explicit so it reads on white paper too

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

function buildTicks(panOffset, extent) {
  const zoom = editorUi.viewport.state.zoom || 1
  const gap = step.value
  const first = Math.floor(-panOffset / zoom / gap) * gap
  const last = (-panOffset + extent) / zoom
  const ticks = []
  for (let value = first; value <= last; value += gap) {
    ticks.push({ value, screen: panOffset + value * zoom })
  }
  return ticks
}

const horizontalTicks = computed(() =>
  buildTicks(editorUi.viewport.state.panX, window.innerWidth),
)
const verticalTicks = computed(() =>
  buildTicks(editorUi.viewport.state.panY, window.innerHeight),
)
</script>

<template>
  <div v-if="shown" data-rulers class="pointer-events-none absolute inset-0">
    <!-- Top ruler -->
    <div
      class="absolute left-0 top-0 bg-surface-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
      :style="{ height: THICKNESS + 'px', left: THICKNESS + 'px', right: 0, borderBottom: TICK_LINE }"
    >
      <div
        v-for="tick in horizontalTicks"
        :key="'h' + tick.value"
        class="absolute bottom-0 h-2"
        :style="{ left: tick.screen - THICKNESS + 'px', borderLeft: TICK_LINE }"
      >
        <span class="absolute left-1 -top-[14px] text-[10px] font-medium leading-none text-ink-gray-6">{{ Math.round(tick.value) }}</span>
      </div>
    </div>

    <!-- Left ruler -->
    <div
      class="absolute left-0 top-0 bg-surface-white shadow-[1px_0_2px_rgba(0,0,0,0.08)]"
      :style="{ width: THICKNESS + 'px', top: THICKNESS + 'px', bottom: 0, borderRight: TICK_LINE }"
    >
      <div
        v-for="tick in verticalTicks"
        :key="'v' + tick.value"
        class="absolute right-0 w-2"
        :style="{ top: tick.screen - THICKNESS + 'px', borderTop: TICK_LINE }"
      >
        <span class="absolute left-0.5 top-0.5 text-[10px] font-medium leading-none text-ink-gray-6">{{ Math.round(tick.value) }}</span>
      </div>
    </div>

    <!-- Corner square -->
    <div
      class="absolute left-0 top-0 bg-surface-white"
      :style="{ width: THICKNESS + 'px', height: THICKNESS + 'px', borderBottom: TICK_LINE, borderRight: TICK_LINE }"
    />
  </div>
</template>
