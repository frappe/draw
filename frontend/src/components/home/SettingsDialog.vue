<script setup>
// App settings dialog, opened from the home sidebar. Holds the document DEFAULTS
// for new diagrams — the theme preset that colours their shapes and the canvas
// background — written straight to the persisted settings singleton
// (useAppSettings), so a choice survives reloads and applies to the next diagram
// created. All chrome is Frappe UI. No dark mode (removed in #91).
import { Dialog } from 'frappe-ui'
import { useAppSettings } from '@/composables/useAppSettings.js'
import { THEME_PRESETS, DEFAULT_THEME_PRESET } from '@/diagram/theme.js'

const open = defineModel('open', { type: Boolean, default: false })
const { settings } = useAppSettings()

// Presets in display order — the neutral default (slate) first, then the rest as
// declared in theme.js. Each tile previews its triad's three stroke colours,
// which are the distinctive part (fills are all pale).
const themeOrder = [DEFAULT_THEME_PRESET, ...Object.keys(THEME_PRESETS).filter((name) => name !== DEFAULT_THEME_PRESET)]
const themePresets = themeOrder.map((name) => ({
  name,
  label: THEME_PRESETS[name].label,
  bands: [THEME_PRESETS[name].t.stroke, THEME_PRESETS[name].t2.stroke, THEME_PRESETS[name].t3.stroke],
}))

// Canvas background options. null = "None" — renders white in the editor but
// exports transparent (schema.js NO_COLOR); the checkerboard swatch signals that.
const backgroundOptions = [
  { value: null, label: 'None' },
  { value: '#FFFFFF', label: 'White' },
  { value: '#F5F5F5', label: 'Light grey' },
]
const CHECKER = 'repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'

// Default look of a new mind-map child node (#126). 'text' keeps the current
// Whimsical-style transparent text (#125); 'shape' boxes children like the root.
const childStyleOptions = [
  { value: 'text', label: 'Text' },
  { value: 'shape', label: 'Shape' },
]
const cellActive = 'bg-surface-gray-3 text-ink-gray-9'
const cellIdle = 'text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <Dialog v-model="open" :options="{ title: 'Settings', size: 'lg' }">
    <template #body-content>
      <div class="flex flex-col gap-6">
        <section>
          <div class="text-[13px] font-medium text-ink-gray-8">Default color theme</div>
          <p class="mb-3 mt-0.5 text-[12px] text-ink-gray-5">Colours the shapes in diagrams you create.</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="preset in themePresets"
              :key="preset.name"
              type="button"
              :aria-pressed="settings.defaultThemePreset === preset.name"
              class="flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors"
              :class="settings.defaultThemePreset === preset.name ? 'border-outline-gray-8' : 'border-outline-gray-2 hover:border-outline-gray-3'"
              @click="settings.defaultThemePreset = preset.name"
            >
              <span class="flex h-8 w-12 overflow-hidden rounded-[5px] border border-black/10">
                <span v-for="band in preset.bands" :key="band" class="flex-1" :style="{ background: band }" />
              </span>
              <span class="text-[11px] text-ink-gray-7">{{ preset.label }}</span>
            </button>
          </div>
        </section>

        <section>
          <div class="text-[13px] font-medium text-ink-gray-8">Default canvas background</div>
          <p class="mb-3 mt-0.5 text-[12px] text-ink-gray-5">The page colour behind new diagrams. None exports transparent.</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in backgroundOptions"
              :key="option.label"
              type="button"
              :aria-pressed="settings.defaultCanvasBackground === option.value"
              class="flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors"
              :class="settings.defaultCanvasBackground === option.value ? 'border-outline-gray-8' : 'border-outline-gray-2 hover:border-outline-gray-3'"
              @click="settings.defaultCanvasBackground = option.value"
            >
              <span class="h-8 w-12 rounded-[5px] border border-black/10" :style="{ background: option.value || CHECKER }" />
              <span class="text-[11px] text-ink-gray-7">{{ option.label }}</span>
            </button>
          </div>
        </section>

        <section>
          <div class="text-[13px] font-medium text-ink-gray-8">Mind map child nodes</div>
          <p class="mb-3 mt-0.5 text-[12px] text-ink-gray-5">How a new child node looks by default. Text is Whimsical-style; Shape draws a box like the root.</p>
          <div class="inline-flex gap-1 rounded-lg border border-outline-gray-2 p-1">
            <button
              v-for="option in childStyleOptions"
              :key="option.value"
              type="button"
              :aria-pressed="settings.mindmapChildStyle === option.value"
              class="h-7 w-20 rounded-md text-[12px] transition-colors"
              :class="settings.mindmapChildStyle === option.value ? cellActive : cellIdle"
              @click="settings.mindmapChildStyle = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </section>
      </div>
    </template>
  </Dialog>
</template>
