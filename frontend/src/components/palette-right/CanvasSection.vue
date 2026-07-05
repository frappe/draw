<script setup>
// Editor settings. The canvas is an infinite, plain-white surface by design —
// no size preset, no background colour, no theme picker — so this popover holds
// just the snap-to-grid toggle.
import { Switch } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

const editorUi = useEditorUi()
</script>

<template>
  <PaletteSection label="Settings">
    <!-- Snap-to-grid: dragged/resized shapes land on the visible grid (spec 4.3). -->
    <div class="flex items-center justify-between">
      <span class="text-[13px] text-ink-gray-7">Snap to grid</span>
      <Switch
        size="sm"
        :model-value="editorUi.state.snapToGrid"
        @change="editorUi.toggleSnapToGrid()"
      />
    </div>
  </PaletteSection>
</template>
