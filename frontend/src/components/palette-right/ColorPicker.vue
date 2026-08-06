<script setup>
// A continuous colour control. Two modes:
//  - default: a labelled swatch trigger that opens the picker in a popover.
//  - inline:  render the full picker body directly (for contexts already inside
//    a popover, where a nested popover wouldn't open — e.g. the block Fill/Border
//    menus and the connector menu).
import { computed } from 'vue'
import { Button, Popover } from 'frappe-ui'
import ColorPickerBody from './ColorPickerBody.vue'

const props = defineProps({
  modelValue: { type: String, default: '#FFFFFF' },
  label: { type: String, default: '' },
  inline: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

// The trigger swatch shows the bound colour (may be 'none').
const swatch = computed(() => {
  const v = (props.modelValue || '').trim()
  return v && v !== 'none' ? v : '#FFFFFF'
})
function onUpdate(color) {
  emit('update:modelValue', color)
}
</script>

<template>
  <!-- Inline: the full picker, no popover wrapper. -->
  <div v-if="inline">
    <div v-if="label" class="mb-1.5 text-[11px] text-ink-gray-6">{{ label }}</div>
    <ColorPickerBody :model-value="modelValue" @update:model-value="onUpdate" />
  </div>

  <!-- Default: labelled swatch trigger opening the picker in a popover. -->
  <div v-else class="flex items-center gap-2">
    <span v-if="label" class="w-12 shrink-0 text-[11px] text-ink-gray-6">{{ label }}</span>
    <Popover>
      <template #target="{ togglePopover }">
        <Button
          class="!flex-1 !justify-start"
          variant="outline"
          theme="gray"
          size="md"
          :label="`Colour ${swatch}`"
          @click="togglePopover()"
        >
          <template #prefix>
            <span class="h-4 w-4 rounded-[3px] border border-outline-gray-2" :style="{ background: swatch }" />
          </template>
          <span class="text-sm font-medium uppercase text-ink-gray-7">{{ swatch }}</span>
        </Button>
      </template>
      <template #body-main>
        <div class="w-[208px] p-2.5">
          <ColorPickerBody :model-value="modelValue" @update:model-value="onUpdate" />
        </div>
      </template>
    </Popover>
  </div>
</template>
