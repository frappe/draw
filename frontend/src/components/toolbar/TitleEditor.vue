<script setup>
// Click-to-edit diagram title (spec §3, §4.4, README §4a). Figma/Docs-style:
// shows the title with a faint pencil; clicking turns it into an inline input.
// Enter / blur commits, Escape cancels. Empty titles fall back to the default.
// Emits update:title; EditorShell renames through the diagram resource.
import { ref, nextTick, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import LucideIcon from '@/icons/LucideIcon.vue'

const props = defineProps({
  title: { type: String, default: 'Untitled diagram' },
})
const emit = defineEmits(['update:title'])
const route = useRoute()

const DEFAULT_TITLE = 'Untitled diagram'
const editing = ref(false)
const draft = ref(props.title)
const input = ref(null)

// A freshly created diagram arrives with ?new=1 — open the title for editing and
// preselect it so the user can type the name right away. But the doc (and its
// real auto-name, e.g. "Mind map 2") loads asynchronously, so we must NOT select
// on mount while the title is still the "Untitled diagram" placeholder — blurring
// would then clobber the real name. Capture the intent (the flag is stripped by
// EditorShell), then fire once the real title has arrived.
const wantsAutoSelect = route.query.new === '1'
let autoSelected = false
function maybeAutoSelect(title) {
  if (!wantsAutoSelect || autoSelected) return
  if (!title || title === DEFAULT_TITLE) return
  autoSelected = true
  nextTick(startEditing)
}
onMounted(() => maybeAutoSelect(props.title))

// Keep the draft in sync when the title arrives/changes from outside (e.g. the
// doc loads asynchronously) and we are not mid-edit; also trigger the deferred
// auto-select once the real title lands.
watch(
  () => props.title,
  (next) => {
    if (!editing.value) draft.value = next
    maybeAutoSelect(next)
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
      class="w-56 max-w-full rounded border border-outline-gray-2 bg-surface-base px-1.5 py-0.5 text-lg font-medium text-ink-gray-9 outline-none focus:border-outline-gray-3"
      @blur="commit"
      @keyup.enter="commit"
      @keyup.esc="cancel"
    />
    <button
      v-else
      class="group flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-lg font-medium text-ink-gray-9 hover:bg-surface-gray-2"
      @click="startEditing"
    >
      <span class="truncate">{{ title }}</span>
      <LucideIcon
        name="edit-2"
        class="h-3.5 w-3.5 flex-none text-ink-gray-4 opacity-0 group-hover:opacity-100"
      />
    </button>
  </div>
</template>
