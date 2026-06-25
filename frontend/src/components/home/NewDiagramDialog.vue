<script setup>
// New-diagram popup (spec §2): name the diagram, then pick a type — each starts
// from a blank canvas of that type. The name becomes the title (and, via the
// backend slug autoname, the editor URL). Emits a `create` payload and closes.
import { ref, watch } from 'vue'
import { Dialog, FeatherIcon, TextInput } from 'frappe-ui'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'create'])

const types = [
  { key: 'block', name: 'Block diagram', hint: 'Boxes, arrows, flows', icon: 'box' },
  { key: 'mindmap', name: 'Mind map', hint: 'Trees, ideas', icon: 'git-branch' },
  { key: 'flowchart', name: 'Flowchart', hint: 'Steps, decisions', icon: 'activity' },
  { key: 'whiteboard', name: 'Whiteboard', hint: 'Freeform', icon: 'edit-3' },
]

const TYPE_TITLE = {
  block: 'Untitled diagram',
  mindmap: 'Untitled mind map',
  flowchart: 'Untitled flowchart',
  whiteboard: 'Untitled whiteboard',
}

const name = ref('')

// Reset the name each time the dialog opens.
watch(
  () => props.modelValue,
  (open) => {
    if (open) name.value = ''
  },
)

function chooseType(type) {
  const title = name.value.trim() || TYPE_TITLE[type.key] || 'Untitled diagram'
  emit('create', { type: type.key, title, document: null })
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
      <label class="mb-1 block text-[12px] font-medium text-ink-gray-7">Name</label>
      <TextInput
        v-model="name"
        type="text"
        placeholder="Untitled diagram"
        class="mb-4"
      />

      <p class="mb-2 text-[12px] font-medium text-ink-gray-7">Type</p>
      <div class="grid grid-cols-2 gap-2.5">
        <button
          v-for="type in types"
          :key="type.key"
          class="relative flex flex-col gap-1.5 rounded-md border border-outline-gray-2 p-3.5 text-left transition-colors hover:border-ink-gray-9 hover:bg-surface-gray-1"
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
