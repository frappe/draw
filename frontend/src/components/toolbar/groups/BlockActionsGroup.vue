<script setup>
// Link, duplicate and delete for the current block selection (#361).
//
// Delete is the one control here that is not gated on `editing` by its caller:
// it hides while a label is being edited, because at that moment the target is
// the text, not the shape.
import { Popover } from 'frappe-ui'
import { useBlockSelection } from '@/composables/useBlockSelection.js'
import LinkSection from '@/components/palette-right/LinkSection.vue'
import ToolbarButton from '../ToolbarButton.vue'

const { store, selection, hasShapes } = useBlockSelection()

function duplicate() {
  const ids = store.duplicate(selection.value)
  if (ids?.length) store.select(ids)
}

function remove() {
  store.removeSelectionOrIds(selection.value)
}
</script>

<template>
  <Popover v-if="hasShapes">
    <template #trigger><ToolbarButton label="Link" icon="lucide-link" /></template>
    <template #default>
      <div class="max-h-[70vh] w-[300px] overflow-y-auto"><LinkSection /></div>
    </template>
  </Popover>

  <ToolbarButton v-if="hasShapes" label="Duplicate" icon="lucide-copy" @click="duplicate" />
  <ToolbarButton label="Delete" icon="lucide-trash-2" theme="red" @click="remove" />
</template>
