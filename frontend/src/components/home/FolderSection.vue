<script setup>
// A named folder group on the home main pane (spec §2, README "Folder
// section"): folder icon + title + count, a hairline rule, then its own tile
// grid. Acts as a drop target so a tile dragged onto it is filed into the
// folder. Empty folders are still shown so they remain a valid drop target.
import { ref } from 'vue'
import { FeatherIcon } from 'frappe-ui'
import DiagramTile from './DiagramTile.vue'

defineProps({
  folder: { type: Object, required: true },
  diagrams: { type: Array, default: () => [] },
})
const emit = defineEmits(['open', 'rename', 'edit-description', 'duplicate', 'delete', 'drop-diagram'])

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

    <div
      v-if="diagrams.length"
      class="grid gap-[18px]"
      style="grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))"
    >
      <DiagramTile
        v-for="diagram in diagrams"
        :key="diagram.name"
        :diagram="diagram"
        @open="emit('open', $event)"
        @rename="emit('rename', $event)"
        @edit-description="emit('edit-description', $event)"
        @duplicate="emit('duplicate', $event)"
        @delete="emit('delete', $event)"
      />
    </div>
    <p v-else class="py-3 text-[11px] text-ink-gray-5">Drag a diagram here to file it.</p>
  </section>
</template>
