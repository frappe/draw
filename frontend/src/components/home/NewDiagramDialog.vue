<script setup>
// New-diagram popup (spec §2). Two steps: first pick a type, then name it. The
// name becomes the title (and, via the backend slug autoname, the editor URL),
// so it must be known before the diagram is created. Cancel/Back returns to the
// type picker; close dismisses.
import { ref, watch, nextTick } from 'vue'
import { Dialog, FeatherIcon, TextInput, Button } from 'frappe-ui'

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

const step = ref('type') // 'type' | 'name'
const chosen = ref(null)
const name = ref('')
const nameInput = ref(null)

// Reset to the type picker each time the dialog opens.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      step.value = 'type'
      chosen.value = null
      name.value = ''
    }
  },
)

function pickType(type) {
  chosen.value = type
  name.value = ''
  step.value = 'name'
  nextTick(() => nameInput.value?.$el?.querySelector('input')?.focus())
}

function back() {
  step.value = 'type'
}

function confirm() {
  const title = name.value.trim() || TYPE_TITLE[chosen.value.key] || 'Untitled diagram'
  emit('create', { type: chosen.value.key, title, document: null })
  emit('update:modelValue', false)
}
</script>

<template>
  <Dialog
    :modelValue="modelValue"
    :options="{ size: 'xl', title: step === 'name' ? `Name your ${chosen?.name.toLowerCase()}` : 'Create a new diagram' }"
    @update:modelValue="emit('update:modelValue', $event)"
  >
    <template #body-content>
      <!-- Step 1: choose a type. -->
      <template v-if="step === 'type'">
        <p class="-mt-1 mb-3 text-[13px] text-ink-gray-5">Pick a diagram type to start from a blank canvas.</p>
        <div class="grid grid-cols-2 gap-2.5">
          <button
            v-for="type in types"
            :key="type.key"
            class="relative flex flex-col gap-1.5 rounded-md border border-outline-gray-2 p-3.5 text-left transition-colors hover:border-ink-gray-9 hover:bg-surface-gray-1"
            @click="pickType(type)"
          >
            <FeatherIcon :name="type.icon" class="h-[18px] w-[18px] text-ink-gray-8" />
            <div class="text-[13px] font-semibold text-ink-gray-9">{{ type.name }}</div>
            <div class="text-[11px] text-ink-gray-5">{{ type.hint }}</div>
          </button>
        </div>
      </template>

      <!-- Step 2: name it. -->
      <template v-else>
        <p class="-mt-1 mb-3 flex items-center gap-1.5 text-[13px] text-ink-gray-5">
          <FeatherIcon :name="chosen.icon" class="h-4 w-4" /> {{ chosen.name }}
        </p>
        <TextInput
          ref="nameInput"
          v-model="name"
          type="text"
          :placeholder="TYPE_TITLE[chosen.key]"
          @keydown.enter="confirm"
        />
      </template>
    </template>

    <template v-if="step === 'name'" #actions>
      <Button variant="solid" @click="confirm">Create</Button>
      <Button variant="subtle" @click="back">Back</Button>
    </template>
  </Dialog>
</template>
