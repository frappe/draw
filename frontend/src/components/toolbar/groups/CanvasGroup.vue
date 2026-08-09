<script setup>
// Canvas-level controls — the ones that act on the whole diagram rather than on
// the selection. They sit at the right end of the toolbar and are always
// present, so the bar still says something useful when nothing is selected.
//
// Theme presets are here because they had no UI at all. design/SPEC.md lists
// them as a canvas control applied diagram-wide in one click, but
// store.applyTheme lost its only caller when the right palette was replaced by
// floating selection editors, and nothing has reached it since.
//
// Guides moved up from the bottom-left viewport controls, where they sat beside
// zoom for want of a better home.
import { computed } from 'vue'
import { Button, Divider, Popover, TabButtons } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { THEME_PRESETS } from '@/diagram/theme.js'
import ToolbarButton from '../ToolbarButton.vue'

const store = useDiagramStore()
const editorUi = useEditorUi()
const modeStrategy = useModeStrategy()

// Each preset previews as its three triad strokes, so the swatches match what a
// shape actually gets rather than being decorative.
const presets = Object.entries(THEME_PRESETS).map(([name, preset]) => ({
  name,
  label: preset.label,
  swatches: [preset.t, preset.t2, preset.t3].map((triad) => triad.stroke),
}))

// A dotted grid is not wanted on a whiteboard (Q4), so the row is hidden there
// rather than offered and quietly ignored.
const showGuides = computed(() => modeStrategy?.value?.type !== 'whiteboard')

const GUIDE_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Rare', value: 'sparse' },
  { label: 'Dense', value: 'dense' },
]
const guides = computed(() => (editorUi.state.gridVisible ? editorUi.state.gridDensity : 'none'))

function setGuides(value) {
  editorUi.state.gridVisible = value !== 'none'
  if (value !== 'none') editorUi.setGridDensity(value)
}
</script>

<template>
  <Popover align="end">
    <template #trigger>
      <ToolbarButton label="Canvas" icon-left="lucide-palette" />
    </template>
    <template #default>
      <div class="w-[228px] p-2">
        <div class="px-1 pb-1.5 text-2xs font-semibold text-ink-gray-4">Theme</div>
        <Button
          v-for="preset in presets"
          :key="preset.name"
          class="w-full !justify-start aria-pressed:bg-surface-gray-3"
          variant="ghost"
          theme="gray"
          size="sm"
          :label="preset.label"
          :aria-pressed="store.state.themePreset === preset.name"
          @click="store.applyTheme(preset.name)"
        >
          <template #prefix>
            <span class="flex gap-0.5">
              <span
                v-for="color in preset.swatches"
                :key="color"
                class="size-2.5 rounded-full"
                :style="{ background: color }"
              />
            </span>
          </template>
        </Button>

        <template v-if="showGuides">
          <Divider class="my-2" />
          <div class="px-1 pb-1.5 text-2xs font-semibold text-ink-gray-4">Guides</div>
          <TabButtons class="w-full" size="sm" :model-value="guides" :options="GUIDE_OPTIONS" @update:model-value="setGuides" />
        </template>
      </div>
    </template>
  </Popover>
</template>
