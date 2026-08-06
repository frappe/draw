<script setup>
// Dotted-guides control for the bottom palette: a dropdown with the three states
// (No / Rare / Dense), the current one checked. The trigger uses a dot-grid icon
// ('grip') so it reads as "dotted guides" and no longer looks like the Table tool
// (which is a solid grid) — the two were easy to confuse (#90).
import { computed } from 'vue'
import { Button, Dropdown } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'

const editorUi = useEditorUi()

const guidesState = computed(() => {
  if (!editorUi.state.gridVisible) return 'no'
  return editorUi.state.gridDensity === 'sparse' ? 'rare' : 'dense'
})
// `icon` holds the COMPLETE lucide utility class. Tailwind's JIT only emits
// classes it can read literally, so `lucide-${name}` produces no CSS and the
// icon renders blank.
const GUIDE_OPTIONS = [
  { key: 'no', label: 'No guides', icon: 'lucide-square' },
  { key: 'rare', label: 'Rare guides', icon: 'lucide-ellipsis' },
  { key: 'dense', label: 'Dense guides', icon: 'lucide-grip' },
]
function setGuides(state) {
  editorUi.state.gridVisible = state !== 'no'
  if (state === 'rare') editorUi.setGridDensity('sparse')
  if (state === 'dense') editorUi.setGridDensity('dense')
}

// The selected state is marked by swapping that row's icon for a check, the same
// way frappe-ui menus indicate a current choice.
const guideOptions = computed(() =>
  GUIDE_OPTIONS.map((option) => ({
    label: option.label,
    icon: guidesState.value === option.key ? 'lucide-check' : option.icon,
    onClick: () => setGuides(option.key),
  })),
)
</script>

<template>
  <Dropdown :options="guideOptions">
    <Button
      :variant="guidesState !== 'no' ? 'subtle' : 'ghost'"
      theme="gray"
      size="md"
      icon="lucide-grip"
      tooltip="Guides"
      label="Guides"
    />
  </Dropdown>
</template>
