<script setup>
// A lone selected connector gets its line controls and nothing else (#361) —
// stroke, width, dash, arrowheads and label all live in ConnectorSection.
import { Popover } from 'frappe-ui'
import ConnectorSection from '@/components/palette-right/ConnectorSection.vue'
import ToolbarButton from '../ToolbarButton.vue'

defineProps({
  connector: { type: Object, required: true },
})
</script>

<template>
  <Popover>
    <template #trigger><ToolbarButton label="Line" icon="lucide-minus" /></template>
    <template #default>
      <div class="max-h-[70vh] w-[300px] overflow-y-auto">
        <ConnectorSection :connector="connector" />
      </div>
    </template>
  </Popover>
</template>
