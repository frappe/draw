<script setup>
// Click-to-edit diagram title (spec §3, §4.4, README §4a). Figma/Docs-style:
// shows the title with a faint pencil; clicking turns it into an inline input.
// Enter / blur commits, Escape cancels. Empty titles fall back to the default.
// Emits update:title; EditorShell renames through the diagram resource.
import { ref, nextTick, watch } from 'vue'
import { FeatherIcon } from 'frappe-ui'

const props = defineProps({
  title: { type: String, default: 'Untitled diagram' },
})
const emit = defineEmits(['update:title'])

const DEFAULT_TITLE = 'Untitled diagram'
const editing = ref(false)
const draft = ref(props.title)
const input = ref(null)

// Keep the draft in sync when the title arrives/changes from outside (e.g. the
// doc loads asynchronously) and we are not mid-edit.
watch(
  () => props.title,
  (next) => {
    if (!editing.value) draft.value = next
  },
)

async function startEditing() {
  draft.value = props.title
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const next = draft.value.trim() || DEFAULT_TITLE
  draft.value = next
  if (next !== props.title) emit('update:title', next)
}

function cancel() {
  draft.value = props.title
  editing.value = false
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <input
      v-if="editing"
      ref="input"
      v-model="draft"
      class="w-56 max-w-full rounded border border-outline-gray-2 bg-surface-white px-1.5 py-0.5 text-sm font-semibold text-ink-gray-9 outline-none focus:border-outline-gray-3"
      @blur="commit"
      @keyup.enter="commit"
      @keyup.esc="cancel"
    />
    <button
      v-else
      class="group flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-sm font-semibold text-ink-gray-9 hover:bg-surface-gray-2"
      @click="startEditing"
    >
      <span class="truncate">{{ title }}</span>
      <FeatherIcon
        name="edit-2"
        class="h-3 w-3 flex-none text-ink-gray-4 opacity-60 group-hover:opacity-100"
      />
    </button>
  </div>
</template>
