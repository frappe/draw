<script setup>
// Dotted-guide density control: No / Rare / Dense. Maps to the editor-UI grid
// (visibility + dense/sparse spacing). Editor-session chrome, not document data.
import { computed } from 'vue'
import PaletteSection from './PaletteSection.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

const editorUi = useEditorUi()

const OPTIONS = [
  { key: 'no', label: 'No' },
  { key: 'rare', label: 'Rare' },
  { key: 'dense', label: 'Dense' },
]

const active = computed(() => {
  if (!editorUi.state.gridVisible) return 'no'
  return editorUi.state.gridDensity === 'sparse' ? 'rare' : 'dense'
})

function setGuides(key) {
  editorUi.state.gridVisible = key !== 'no'
  if (key === 'rare') editorUi.setGridDensity('sparse')
  if (key === 'dense') editorUi.setGridDensity('dense')
}
</script>

<template>
  <PaletteSection label="Guides">
    <div class="flex gap-1.5">
      <button
        v-for="option in OPTIONS"
        :key="option.key"
        class="h-8 flex-1 rounded-md border text-xs"
        :class="active === option.key
          ? 'border-ink-gray-9 bg-surface-gray-2 font-medium text-ink-gray-9'
          : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-1'"
        @click="setGuides(option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  </PaletteSection>
</template>
