<script setup>
// Arrange, align, distribute and transform for the current block selection
// (#361). Each opens just its own palette-right section rather than one crammed
// panel, and the two that act BETWEEN shapes appear only for a multi-selection,
// so a lone shape never opens an empty menu.
import { Popover } from 'frappe-ui'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import ArrangeSection from '@/components/palette-right/ArrangeSection.vue'
import AlignSection from '@/components/palette-right/AlignSection.vue'
import DistributeSizeSection from '@/components/palette-right/DistributeSizeSection.vue'
import TransformSection from '@/components/palette-right/TransformSection.vue'
import ToolbarButton from '../ToolbarButton.vue'

const { multi } = useBlockSelection()

const panel = 'max-h-[70vh] w-[300px] overflow-y-auto'
</script>

<template>
  <Popover>
    <template #trigger><ToolbarButton label="Arrange" icon="lucide-layers" /></template>
    <template #default><div :class="panel"><ArrangeSection /></div></template>
  </Popover>

  <Popover v-if="multi">
    <template #trigger><ToolbarButton label="Align" icon="lucide-align-center-horizontal" /></template>
    <template #default><div :class="panel"><AlignSection /></div></template>
  </Popover>

  <Popover v-if="multi">
    <template #trigger><ToolbarButton label="Distribute & size" icon="lucide-columns-2" /></template>
    <template #default><div :class="panel"><DistributeSizeSection /></div></template>
  </Popover>

  <Popover>
    <template #trigger><ToolbarButton label="Transform" icon="lucide-flip-horizontal-2" /></template>
    <template #default><div :class="panel"><TransformSection /></div></template>
  </Popover>
</template>
