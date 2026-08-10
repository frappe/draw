<script setup>
// "Add to collection" for one diagram (#217). Checkboxes, not a single choice:
// collections are labels, so a diagram can be in several and unticking one does
// not move it anywhere.
//
// Each tick writes immediately rather than collecting into a Save button — there
// is nothing to validate, and an add is idempotent server-side, so a half-finished
// dialog leaves nothing inconsistent.
import { computed, ref, watch } from 'vue'
import { Button, Checkbox, Dialog, toast } from 'frappe-ui'
import { addToCollection, collectionsOf, removeFromCollection } from '@/data/collections.js'

const props = defineProps({
  // { name, title } of the diagram being filed, or null when closed.
  diagram: { type: Object, default: null },
  collections: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'changed'])

const memberOf = ref(new Set())
const loading = ref(false)

// The dialog is open exactly while a diagram is being filed. Modern Dialog API
// (v-model:open), not the deprecated options/body-content one (#298).
const open = computed({
  get: () => Boolean(props.diagram),
  set: (value) => !value && emit('close'),
})
const title = computed(() =>
  props.diagram ? `Add "${props.diagram.title}" to…` : 'Add to collection',
)

watch(
  () => props.diagram,
  async (diagram) => {
    if (!diagram) return
    loading.value = true
    memberOf.value = new Set(await collectionsOf(diagram.name))
    loading.value = false
  },
  { immediate: true },
)

async function toggle(collection, checked) {
  const next = new Set(memberOf.value)
  // Move the tick first: the write is idempotent and the round trip should not
  // make the checkbox feel laggy.
  if (checked) next.add(collection.name)
  else next.delete(collection.name)
  memberOf.value = next
  try {
    if (checked) await addToCollection(collection.name, props.diagram.name)
    else await removeFromCollection(collection.name, props.diagram.name)
    emit('changed')
  } catch (error) {
    // Put the tick back where the server says it is.
    const reverted = new Set(memberOf.value)
    if (checked) reverted.delete(collection.name)
    else reverted.add(collection.name)
    memberOf.value = reverted
    toast.error('Could not update the collection', { text: error?.message || '' })
  }
}
</script>

<template>
  <Dialog v-model:open="open" :title="title">
    <template #default>
      <p v-if="!collections.length" class="text-sm text-ink-gray-5">
        You have no collections yet. Make one with the + above the list.
      </p>

      <div v-else class="space-y-2">
        <!-- Checkbox's own `label` prop, not a wrapping <label>: it renders a
             properly associated <label for>, which is what gives the box an
             accessible name and makes the text itself toggle it. -->
        <div
          v-for="collection in collections"
          :key="collection.name"
          class="flex items-center justify-between gap-2.5 rounded-md px-1 py-1 hover:bg-surface-gray-2"
        >
          <Checkbox
            size="sm"
            :disabled="loading"
            :label="collection.title"
            :model-value="memberOf.has(collection.name)"
            @update:model-value="(checked) => toggle(collection, checked)"
          />
          <span class="text-2xs text-ink-gray-5">{{ collection.count }}</span>
        </div>
        <p class="pt-1 text-xs text-ink-gray-5">
          A drawing can be in several. Unticking one does not move or delete it.
        </p>
      </div>
    </template>

    <template #actions>
      <div class="flex justify-end">
        <Button variant="subtle" @click="emit('close')">Done</Button>
      </div>
    </template>
  </Dialog>
</template>
