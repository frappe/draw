<script setup>
// A folder shown in the Home explorer — a tile or a list row. Clicking opens
// the folder (drill-down); dropping a dragged diagram onto it files the diagram.
import { ref } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'

defineProps({
  folder: { type: Object, required: true },
  view: { type: String, default: 'tile' },
  count: { type: Number, default: 0 },
})
const emit = defineEmits(['open', 'drop-diagram'])

const dragOver = ref(false)

function onDrop(event) {
  dragOver.value = false
  const name = event.dataTransfer.getData('text/diagram-name')
  if (name) emit('drop-diagram', name)
}
</script>

<template>
  <!-- LIST ROW -->
  <button
    v-if="view === 'list'"
    class="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left"
    :class="dragOver ? 'border-outline-blue-3 bg-surface-blue-1' : 'border-outline-gray-1 bg-surface-base hover:bg-surface-gray-1'"
    @click="emit('open')"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-surface-gray-2 text-ink-gray-7">
      <LucideIcon name="folder" class="h-4 w-4" />
    </div>
    <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-gray-9">{{ folder.folder_name || folder.name }}</span>
    <span class="text-[11px] text-ink-gray-5">{{ count }} item{{ count === 1 ? '' : 's' }}</span>
  </button>

  <!-- TILE -->
  <button
    v-else
    class="flex h-[166px] flex-col items-center justify-center gap-2 rounded-xl border text-ink-gray-7"
    :class="dragOver ? 'border-outline-blue-3 bg-surface-blue-1' : 'border-outline-gray-1 bg-surface-base hover:bg-surface-gray-1'"
    @click="emit('open')"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <LucideIcon name="folder" class="h-9 w-9 text-ink-gray-6" />
    <span class="max-w-[90%] truncate text-[13px] font-semibold text-ink-gray-9">{{ folder.folder_name || folder.name }}</span>
    <span class="text-[11px] text-ink-gray-5">{{ count }} item{{ count === 1 ? '' : 's' }}</span>
  </button>
</template>
