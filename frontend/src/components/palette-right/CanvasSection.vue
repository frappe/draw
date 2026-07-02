<script setup>
// Canvas controls: size preset + background color (spec §4.3). Wired to
// store.setCanvas; the feature agent can add a full picker. Background swatches
// include a transparent ("no color") option.
import { computed } from 'vue'
import { Select, Switch } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { CANVAS_PRESETS } from '@/diagram/canvasPresets.js'
import { findPreset } from '@/diagram/canvasPresets.js'
import { THEME_PRESET_NAMES, findThemePreset } from '@/diagram/theme.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const backgrounds = [null, '#FFFFFF', '#F8F8F8', '#EFF6FF', '#FDFAED', '#FCEAF5']

// Coordinated colour themes (spec 8.1). Each chip previews the preset's three
// triad fills; applying re-paints shapes that still wear the old theme's triad.
const themes = THEME_PRESET_NAMES.map((name) => {
  const preset = findThemePreset(name)
  return { name, label: preset.label, swatches: [preset.t.fill, preset.t2.fill, preset.t3.fill], stroke: preset.t.stroke }
})

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
          color === null ? 'bg-surface-base' : '',
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

    <!-- Coordinated colour themes (spec 8.1). -->
    <div class="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Theme</div>
    <div class="flex gap-1.5">
      <button
        v-for="theme in themes"
        :key="theme.name"
        class="flex h-8 flex-1 items-center justify-center gap-0.5 rounded-md border"
        :class="store.state.themePreset === theme.name ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2 hover:border-outline-gray-3'"
        :title="theme.label"
        :aria-label="`Theme ${theme.label}`"
        :aria-pressed="store.state.themePreset === theme.name"
        @click="store.applyTheme(theme.name)"
      >
        <span
          v-for="(color, i) in theme.swatches"
          :key="i"
          class="h-3.5 w-3.5 rounded-[3px] border"
          :style="{ background: color, borderColor: theme.stroke }"
        />
      </button>
    </div>

    <!-- Snap-to-grid: dragged/resized shapes land on the visible grid (spec 4.3). -->
    <div class="mt-3 flex items-center justify-between">
      <span class="text-[13px] text-ink-gray-7">Snap to grid</span>
      <Switch
        size="sm"
        :model-value="editorUi.state.snapToGrid"
        @change="editorUi.toggleSnapToGrid()"
      />
    </div>

    <!-- Infinite canvas: pan/work beyond the page bounds (spec 1.5). -->
    <div class="mt-2 flex items-center justify-between">
      <span class="text-[13px] text-ink-gray-7">Infinite canvas</span>
      <Switch
        size="sm"
        :model-value="editorUi.state.infiniteCanvas"
        @change="editorUi.toggleInfiniteCanvas()"
      />
    </div>
  </PaletteSection>
</template>
