<script setup>
// New-diagram popup (spec §2). One step: pick a type and you land straight on the
// canvas with the title selected for inline renaming (no separate naming step).
import { Dialog, FeatherIcon } from 'frappe-ui'

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

// Roadmap — shown grayed out so users see what's coming. Not yet buildable.
const comingSoon = [
  { key: 'wireframe', name: 'Wireframe', hint: 'Mobile & web wireframes', icon: 'smartphone' },
  { key: 'designer', name: 'Designer', hint: 'Pro design — frames & layers', icon: 'pen-tool' },
  { key: 'paint', name: 'Paint', hint: 'Freeform painting', icon: 'droplet' },
  { key: 'notebook', name: 'Notebook', hint: 'Multi-page notes', icon: 'book-open' },
]

const TYPE_TITLE = {
  block: 'Untitled diagram',
  mindmap: 'Untitled mind map',
  flowchart: 'Untitled flowchart',
  whiteboard: 'Untitled whiteboard',
}

// Pick a type → create immediately with the default title and dismiss; the
// editor opens with the title selected so the user types the name there.
function pickType(type) {
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
      <p class="-mt-1 mb-3 text-[13px] text-ink-gray-5">Pick a diagram type to start from a blank canvas.</p>
      <div>
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

        <!-- Roadmap: disabled tiles previewing types still in development. -->
        <p class="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Coming soon</p>
        <div class="grid grid-cols-2 gap-2.5">
          <div
            v-for="type in comingSoon"
            :key="type.key"
            class="relative flex cursor-not-allowed flex-col gap-1.5 rounded-md border border-outline-gray-2 p-3.5 text-left opacity-60"
            aria-disabled="true"
          >
            <FeatherIcon :name="type.icon" class="h-[18px] w-[18px] text-ink-gray-5" />
            <div class="text-[13px] font-semibold text-ink-gray-7">{{ type.name }}</div>
            <div class="text-[11px] text-ink-gray-5">{{ type.hint }}</div>
            <span
              class="absolute right-2 top-2 rounded-full bg-surface-gray-3 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-gray-6"
            >
              Soon
            </span>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>
