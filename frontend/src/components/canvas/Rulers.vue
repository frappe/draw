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

const THICKNESS = 22
const MIN_TICK_GAP = 60 // minimum screen px between major ticks

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
      class="absolute left-0 top-0 border-b border-outline-gray-1 bg-surface-white/95"
      :style="{ height: THICKNESS + 'px', left: THICKNESS + 'px', right: 0 }"
    >
      <div
        v-for="tick in horizontalTicks"
        :key="'h' + tick.value"
        class="absolute top-0 h-full border-l border-outline-gray-2"
        :style="{ left: tick.screen - THICKNESS + 'px' }"
      >
        <span class="absolute left-1 top-0.5 text-[9px] leading-none text-ink-gray-5">{{ Math.round(tick.value) }}</span>
      </div>
    </div>

    <!-- Left ruler -->
    <div
      class="absolute left-0 top-0 border-r border-outline-gray-1 bg-surface-white/95"
      :style="{ width: THICKNESS + 'px', top: THICKNESS + 'px', bottom: 0 }"
    >
      <div
        v-for="tick in verticalTicks"
        :key="'v' + tick.value"
        class="absolute left-0 w-full border-t border-outline-gray-2"
        :style="{ top: tick.screen - THICKNESS + 'px' }"
      >
        <span class="absolute left-0.5 top-0.5 text-[9px] leading-none text-ink-gray-5">{{ Math.round(tick.value) }}</span>
      </div>
    </div>

    <!-- Corner square -->
    <div
      class="absolute left-0 top-0 border-b border-r border-outline-gray-1 bg-surface-white"
      :style="{ width: THICKNESS + 'px', height: THICKNESS + 'px' }"
    />
  </div>
</template>
