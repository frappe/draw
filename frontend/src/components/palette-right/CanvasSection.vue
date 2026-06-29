<script setup>
// Canvas controls: size preset + background color (spec §4.3). Wired to
// store.setCanvas; the feature agent can add a full picker. Background swatches
// include a transparent ("no color") option.
import { computed } from 'vue'
import { Select, Switch } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { CANVAS_PRESETS } from '@/diagram/canvasPresets.js'
import { findPreset } from '@/diagram/canvasPresets.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const backgrounds = [null, '#FFFFFF', '#F8F8F8', '#EFF6FF', '#FDFAED', '#FCEAF5']

const presetOptions = computed(() =>
  CANVAS_PRESETS.map((preset) => ({
    label: `${preset.name} · ${preset.width} × ${preset.height}`,
    value: preset.name,
  })),
)

function applyPreset(name) {
  const preset = findPreset(name)
  store.setCanvas({ sizePreset: preset.name, width: preset.width, height: preset.height })
}
</script>

<template>
  <PaletteSection label="Canvas">
    <Select
      class="mb-2.5"
      :model-value="store.state.canvas.sizePreset"
      :options="presetOptions"
      @update:model-value="applyPreset"
    />

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="(color, index) in backgrounds"
        :key="index"
        class="h-[22px] w-[22px] rounded-[5px] border"
        :class="[
          color === null ? 'bg-surface-white' : '',
          store.state.canvas.background === color
            ? 'border-[1.5px] border-ink-gray-9'
            : 'border-black/10',
        ]"
        :style="color ? { background: color } : {}"
        :title="color === null ? 'No color (transparent)' : color"
        :aria-label="color === null ? 'Background: no color' : `Background ${color}`"
        @click="store.setCanvas({ background: color })"
      >
        <span v-if="color === null" class="text-[9px] text-ink-gray-4">∅</span>
      </button>
    </div>

    <!-- Snap-to-grid: dragged/resized shapes land on the visible grid (spec 4.3). -->
    <div class="mt-3 flex items-center justify-between">
      <span class="text-[13px] text-ink-gray-7">Snap to grid</span>
      <Switch
        size="sm"
        :model-value="editorUi.state.snapToGrid"
        @update:model-value="editorUi.toggleSnapToGrid()"
      />
    </div>
  </PaletteSection>
</template>
