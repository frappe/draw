<script setup>
// New-diagram popup (spec §2): pick a diagram type — each starts from a blank
// canvas of that type. Emits a `create` payload and closes. (Templates removed
// for simplicity; every type begins blank.)
import { Dialog, FeatherIcon } from 'frappe-ui'

defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'create'])

const types = [
  { key: 'block', name: 'Block diagram', hint: 'Boxes, arrows, flows', icon: 'box', enabled: true },
  { key: 'mindmap', name: 'Mind map', hint: 'Trees, ideas', icon: 'git-branch', enabled: true },
  { key: 'flowchart', name: 'Flowchart', hint: 'Steps, decisions', icon: 'activity', enabled: true },
  { key: 'whiteboard', name: 'Whiteboard', hint: 'Freeform', icon: 'edit-3', enabled: true },
]

const TYPE_TITLE = {
  block: 'Untitled diagram',
  mindmap: 'Untitled mind map',
  flowchart: 'Untitled flowchart',
  whiteboard: 'Untitled whiteboard',
}

// A blank canvas of the chosen type (document: null → createDiagram seeds the
// right empty document for that type).
function chooseType(type) {
  if (!type.enabled) return
  emit('create', { type: type.key, title: TYPE_TITLE[type.key] || 'Untitled diagram', document: null })
  emit('update:modelValue', false)
}
</script>

<template>
  <Dialog
    :modelValue="modelValue"
    :options="{ size: 'xl', title: 'Create a new diagram' }"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <template #body-content>
      <p class="-mt-1 mb-4 text-[13px] text-ink-gray-5">Pick a diagram type to start from a blank canvas.</p>

      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="type in types"
          :key="type.key"
          :disabled="!type.enabled"
          class="relative flex flex-col gap-1.5 rounded-md border p-3.5 text-left transition-colors"
          :class="type.enabled
            ? 'border-outline-gray-2 hover:border-ink-gray-9 hover:bg-surface-gray-1'
            : 'cursor-default border-outline-gray-1 bg-surface-gray-1 opacity-70'"
          @click="chooseType(type)"
        >
          <FeatherIcon :name="type.icon" class="h-[18px] w-[18px] text-ink-gray-8" />
          <div class="text-[13px] font-semibold text-ink-gray-9">{{ type.name }}</div>
          <div class="text-[11px] text-ink-gray-5">{{ type.hint }}</div>
        </button>
      </div>
    </template>
  </Dialog>
</template>
