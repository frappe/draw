<script setup>
// Dotted-guides control for the bottom palette: a popover with the three states
// (No / Rare / Dense), the current one checked. The trigger uses a dot-grid icon
// ('grip') so it reads as "dotted guides" and no longer looks like the Table tool
// (which is a solid grid) — the two were easy to confuse (#90).
import { computed } from 'vue'
import { Popover, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'

const editorUi = useEditorUi()

const guidesState = computed(() => {
  if (!editorUi.state.gridVisible) return 'no'
  return editorUi.state.gridDensity === 'sparse' ? 'rare' : 'dense'
})
const GUIDE_OPTIONS = [
  { key: 'no', label: 'No guides', icon: 'square' },
  { key: 'rare', label: 'Rare guides', icon: 'ellipsis' },
  { key: 'dense', label: 'Dense guides', icon: 'grip' },
]
function setGuides(state) {
  editorUi.state.gridVisible = state !== 'no'
  if (state === 'rare') editorUi.setGridDensity('sparse')
  if (state === 'dense') editorUi.setGridDensity('dense')
}

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <Popover>
    <template #target="{ togglePopover }">
      <Tooltip text="Guides">
        <button
          :class="[buttonBase, guidesState !== 'no' ? 'bg-surface-gray-2 text-ink-gray-9' : '']"
          @click="togglePopover()"
        >
          <LucideIcon name="grip" class="h-4 w-4" />
        </button>
      </Tooltip>
    </template>
    <template #body-main="{ togglePopover }">
      <div class="w-40 p-1">
        <button
          v-for="opt in GUIDE_OPTIONS"
          :key="opt.key"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-gray-2"
          :class="guidesState === opt.key ? 'text-ink-gray-9' : 'text-ink-gray-7'"
          @click="setGuides(opt.key); togglePopover()"
        >
          <LucideIcon :name="opt.icon" class="h-4 w-4 text-ink-gray-6" />
          {{ opt.label }}
          <LucideIcon v-if="guidesState === opt.key" name="check" class="ml-auto h-4 w-4 text-ink-gray-9" />
        </button>
      </div>
    </template>
  </Popover>
</template>
