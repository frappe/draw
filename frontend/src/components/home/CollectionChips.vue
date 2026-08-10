<script setup>
// The collection filter strip above Home's list (#217). One chip per collection,
// each with the number of diagrams in it; click to narrow the list, click the same
// one again to clear. "+" adds a collection.
//
// A strip rather than tiles or a tab, so filtering never leaves the page you are
// on — collections are labels, and a label is something you filter by, not a place
// you go into.
import { ref } from 'vue'
import { Button, Dialog, TextInput, Tooltip, dialog, toast } from 'frappe-ui'
import { createCollection, deleteCollection, renameCollection } from '@/data/collections.js'

const props = defineProps({
  collections: { type: Array, default: () => [] },
  active: { type: String, default: '' },
})
const emit = defineEmits(['select', 'changed'])

const showCreate = ref(false)
const draftName = ref('')
const busy = ref(false)

function toggle(name) {
  emit('select', props.active === name ? '' : name)
}

async function create() {
  const title = draftName.value.trim()
  if (!title || busy.value) return
  busy.value = true
  try {
    await createCollection(title)
    showCreate.value = false
    draftName.value = ''
    emit('changed')
  } catch (error) {
    toast.error('Could not create the collection', { text: error?.message || '' })
  } finally {
    busy.value = false
  }
}

function startRename(collection) {
  dialog({
    title: 'Rename collection',
    fields: [{ label: 'Name', fieldname: 'title', default: collection.title, required: true }],
    primaryAction: {
      label: 'Rename',
      onClick: async ({ title }) => {
        await renameCollection(collection.name, title)
        emit('changed')
      },
    },
  })
}

// Deleting a collection never deletes what is in it — say so, or it reads as
// destructive and no one will touch it.
function confirmDelete(collection) {
  dialog.confirm({
    title: 'Delete collection?',
    message: `"${collection.title}" will be removed. The ${collection.count} drawing${
      collection.count === 1 ? '' : 's'
    } in it stay in your library.`,
    theme: 'red',
    confirmLabel: 'Delete',
    onConfirm: async () => {
      await deleteCollection(collection.name)
      if (props.active === collection.name) emit('select', '')
      emit('changed')
    },
  })
}
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <!-- Two sibling buttons in a wrapper, never a button inside a button: nesting
         them is invalid, and the inner one becomes unreachable by keyboard. -->
    <div
      v-for="collection in collections"
      :key="collection.name"
      class="group flex items-center rounded-full border py-1 pl-3 pr-1 text-sm transition-colors"
      :class="
        active === collection.name
          ? 'border-outline-gray-4 bg-surface-gray-4 text-ink-gray-9'
          : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-2'
      "
    >
      <button
        class="flex items-center gap-1.5"
        :aria-pressed="active === collection.name"
        @click="toggle(collection.name)"
        @dblclick="startRename(collection)"
      >
        <span>{{ collection.title }}</span>
        <span class="text-2xs text-ink-gray-5">{{ collection.count }}</span>
      </button>
      <button
        class="ml-1 flex size-5 items-center justify-center rounded-full text-ink-gray-5 opacity-0 hover:bg-surface-gray-3 hover:text-ink-gray-8 focus-visible:opacity-100 group-hover:opacity-100"
        :aria-label="`Delete ${collection.title}`"
        @click="confirmDelete(collection)"
      >
        <span class="lucide-x size-3" aria-hidden="true" />
      </button>
    </div>

    <Tooltip text="New collection">
      <Button
        variant="ghost"
        icon="lucide-plus"
        label="New collection"
        @click="showCreate = true"
      />
    </Tooltip>

    <Dialog v-model:open="showCreate" title="New collection">
      <template #default>
        <TextInput
          v-model="draftName"
          type="text"
          size="lg"
          variant="outline"
          label="Name"
          placeholder="Onboarding, Q3 planning…"
          @keydown.enter="create"
        />
        <p class="mt-2 text-xs text-ink-gray-5">
          A drawing can be in as many collections as you like. Nothing is moved.
        </p>
      </template>
      <template #actions>
        <div class="flex justify-end">
          <Button variant="solid" :loading="busy" :disabled="!draftName.trim()" @click="create">
            Create
          </Button>
        </div>
      </template>
    </Dialog>
  </div>
</template>
