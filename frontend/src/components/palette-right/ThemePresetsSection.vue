<script setup>
// Theme presets: one-click diagram-wide restyle (signature, spec §4.3). Wired
// directly to store.applyTheme; active card gets a gray-900 border.
import PaletteSection from './PaletteSection.vue'
import { THEME_PRESETS, THEME_PRESET_NAMES } from '@/diagram/theme.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()

function triadBars(name) {
  const preset = THEME_PRESETS[name]
  return [preset.t.stroke, preset.t2.stroke, preset.t3.stroke]
}
</script>

<template>
  <PaletteSection label="Theme presets">
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="name in THEME_PRESET_NAMES"
        :key="name"
        class="rounded-md p-2 text-left hover:bg-surface-gray-1"
        :class="
          store.state.themePreset === name
            ? 'border-[1.5px] border-ink-gray-9'
            : 'border border-outline-gray-1'
        "
        @click="store.applyTheme(name)"
      >
        <div class="mb-1.5 flex gap-1">
          <span
            v-for="bar in triadBars(name)"
            :key="bar"
            class="h-3 flex-1 rounded-sm"
            :style="{ background: bar }"
          />
        </div>
        <span class="text-xs font-medium text-ink-gray-8">{{ THEME_PRESETS[name].label }}</span>
      </button>
    </div>
  </PaletteSection>
</template>
