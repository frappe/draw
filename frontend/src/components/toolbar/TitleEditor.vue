<script setup>
// Click-to-edit diagram title (spec §3, §4.4). Stub: renders the title and an
// edit input on click. The feature agent adds debounced rename through the
// diagram resource.
import { ref } from 'vue'
import { FeatherIcon } from 'frappe-ui'

const props = defineProps({
  title: { type: String, default: 'Untitled diagram' },
})
const emit = defineEmits(['update:title'])

const editing = ref(false)
const draft = ref(props.title)

function commit() {
  editing.value = false
  if (draft.value !== props.title) emit('update:title', draft.value)
}
</script>

<template>
  <div class="flex items-center gap-1.5">
    <input
      v-if="editing"
      v-model="draft"
      class="rounded border border-outline-gray-2 bg-surface-white px-1.5 py-0.5 text-sm font-semibold text-ink-gray-9 outline-none"
      @blur="commit"
      @keyup.enter="commit"
    />
    <button
      v-else
      class="flex items-center gap-1.5 text-sm font-semibold text-ink-gray-9"
      @click="editing = true"
    >
      <span>{{ title }}</span>
      <FeatherIcon name="edit-2" class="h-3 w-3 text-ink-gray-4" />
    </button>
  </div>
</template>
