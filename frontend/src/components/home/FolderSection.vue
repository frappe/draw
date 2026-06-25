<script setup>
// A named folder group on the home main pane (spec §2). Folder header + count,
// a hairline rule, then its diagrams in the active view. Acts as a drop target
// so a tile dragged onto it is filed into the folder.
import { ref } from 'vue'
import { FeatherIcon } from 'frappe-ui'
import DiagramCollection from './DiagramCollection.vue'

defineProps({
  folder: { type: Object, required: true },
  diagrams: { type: Array, default: () => [] },
  view: { type: String, default: 'tile' },
  selected: { type: Object, default: () => new Set() },
})
const emit = defineEmits([
  'open', 'toggle-select', 'toggle-pin', 'rename', 'duplicate', 'delete', 'drop-diagram',
])

const dragOver = ref(false)

function onDrop(event) {
  dragOver.value = false
  const name = event.dataTransfer.getData('text/diagram-name')
  if (name) emit('drop-diagram', name)
}
</script>

<template>
  <section
    class="mt-9 rounded-xl transition-colors"
    :class="dragOver ? 'bg-surface-gray-1 outline-dashed outline-1 outline-outline-gray-3' : ''"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="mb-3 flex items-center gap-2 border-b border-outline-gray-1 pb-2">
      <FeatherIcon name="folder" class="h-4 w-4 text-ink-gray-6" />
      <span class="text-[13px] font-semibold text-ink-gray-9">{{ folder.folder_name || folder.name }}</span>
      <span class="text-[11px] text-ink-gray-5">{{ diagrams.length }}</span>
    </div>

    <DiagramCollection
      v-if="diagrams.length"
      :diagrams="diagrams"
      :view="view"
      :selected="selected"
      @open="emit('open', $event)"
      @toggle-select="emit('toggle-select', $event)"
      @toggle-pin="emit('toggle-pin', $event)"
      @rename="emit('rename', $event)"
      @duplicate="emit('duplicate', $event)"
      @delete="emit('delete', $event)"
    />
    <p v-else class="py-3 text-[11px] text-ink-gray-5">Drag a diagram here to file it.</p>
  </section>
</template>
