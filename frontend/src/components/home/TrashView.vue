<script setup>
// Trash view (spec §2, README "Trash view"): an amber 30-day warning banner
// over a grid of trashed diagrams, each with Restore and permanent Delete.
// Loads only trashed diagrams; restore clears the flag, delete removes the doc.
import { computed, onMounted, reactive } from 'vue'
import { createListResource, Button, Dialog } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { documentToSvg, isDocumentEmpty } from '@/composables/useThumbnail.js'

const emit = defineEmits(['changed'])

const trashed = createListResource({
  doctype: 'Draw Diagram',
  fields: ['name', 'title', 'modified', 'document'],
  filters: { is_trashed: 1 },
  orderBy: 'trashed_on desc',
  pageLength: 500,
})

onMounted(() => trashed.fetch())

const rows = computed(() => trashed.data || [])

function preview(document) {
  if (!document || isDocumentEmpty(document)) return null
  return documentToSvg(document)
}

async function restore(diagram) {
  await trashed.setValue.submit({ name: diagram.name, is_trashed: 0, trashed_on: null })
  refresh()
}

// Permanent delete is irreversible, so it always asks first.
const confirmPurge = reactive({ open: false, diagram: null })

function askPurge(diagram) {
  confirmPurge.diagram = diagram
  confirmPurge.open = true
}

async function performPurge() {
  await trashed.delete.submit(confirmPurge.diagram.name)
  confirmPurge.open = false
  confirmPurge.diagram = null
  refresh()
}

function refresh() {
  trashed.reload()
  emit('changed')
}
</script>

<template>
  <div>
    <h1 class="mb-4 text-[22px] font-bold text-ink-gray-9">Trash</h1>

    <div
      class="mb-6 flex items-center gap-2 rounded-[10px] border border-outline-amber-2 bg-surface-amber-1 px-3 py-2.5 text-[13px] text-ink-amber-3"
    >
      <LucideIcon name="alert-triangle" class="h-4 w-4" />
      Items in trash are permanently deleted after 30 days.
    </div>

    <p v-if="!rows.length" class="text-[13px] text-ink-gray-5">Trash is empty.</p>

    <div v-else class="grid gap-[18px]" style="grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))">
      <div
        v-for="diagram in rows"
        :key="diagram.name"
        class="overflow-hidden rounded-xl border border-outline-gray-1 bg-surface-white"
      >
        <div class="flex h-[120px] items-center justify-center border-b border-outline-gray-1 bg-surface-white p-2 opacity-[0.55]">
          <div
            v-if="preview(diagram.document)"
            class="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            v-html="preview(diagram.document)"
          />
          <LucideIcon v-else name="image" class="h-7 w-7 text-ink-gray-3" />
        </div>
        <div class="px-3 py-2.5">
          <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ diagram.title }}</div>
          <div class="mt-2 flex gap-2">
            <Button variant="outline" @click="restore(diagram)">Restore</Button>
            <Button variant="outline" theme="red" @click="askPurge(diagram)">Delete</Button>
          </div>
        </div>
      </div>
    </div>

    <Dialog v-model="confirmPurge.open" :options="{ title: 'Delete permanently?' }">
      <template #body-content>
        <p class="text-base text-ink-gray-7">
          “{{ confirmPurge.diagram?.title }}” will be permanently deleted. This cannot be undone.
        </p>
      </template>
      <template #actions>
        <Button variant="solid" theme="red" @click="performPurge">Delete forever</Button>
        <Button variant="subtle" @click="confirmPurge.open = false">Cancel</Button>
      </template>
    </Dialog>
  </div>
</template>
