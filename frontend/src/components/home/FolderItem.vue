<script setup>
// A folder shown in the Home explorer — a tile or a list row. Clicking opens the
// folder (drill-down); dropping a dragged diagram onto it files the diagram; a
// leading checkbox selects it for bulk actions, parity with diagrams (H2).
import { ref } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'

defineProps({
  folder: { type: Object, required: true },
  view: { type: String, default: 'tile' },
  count: { type: Number, default: 0 },
  selected: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'drop-diagram', 'toggle-select'])

const dragOver = ref(false)

function onDrop(event) {
  dragOver.value = false
  const name = event.dataTransfer.getData('text/diagram-name')
  if (name) emit('drop-diagram', name)
}
</script>

<template>
  <!-- LIST ROW -->
  <div
    v-if="view === 'list'"
    class="group flex w-full items-center gap-3 rounded-lg border px-3 py-1.5"
    :class="selected ? 'border-outline-blue-2 bg-surface-blue-1' : dragOver ? 'border-outline-blue-3 bg-surface-blue-1' : 'border-outline-gray-1 bg-surface-base hover:bg-surface-gray-1'"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <button
      class="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border"
      :class="selected ? 'border-outline-blue-3 bg-surface-blue-3 text-white' : 'border-outline-gray-3 text-transparent hover:border-ink-gray-5'"
      @click.stop="emit('toggle-select', folder.name)"
    >
      <LucideIcon name="check" class="h-3 w-3" />
    </button>
    <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="emit('open')">
      <div class="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-surface-gray-2 text-ink-gray-7">
        <LucideIcon name="folder" class="h-4 w-4" />
      </div>
      <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-gray-9">{{ folder.folder_name || folder.name }}</span>
    </button>
    <span class="text-[11px] text-ink-gray-5">{{ count }} item{{ count === 1 ? '' : 's' }}</span>
  </div>

  <!-- TILE -->
  <div
    v-else
    class="group relative flex h-[166px] flex-col items-center justify-center gap-2 rounded-xl border text-ink-gray-7"
    :class="selected ? 'border-outline-blue-2 bg-surface-blue-1' : dragOver ? 'border-outline-blue-3 bg-surface-blue-1' : 'border-outline-gray-1 bg-surface-base hover:bg-surface-gray-1'"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <button
      class="absolute left-2.5 top-2.5 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-opacity"
      :class="[
        selected ? 'border-outline-blue-3 bg-surface-blue-3 text-white' : 'border-outline-gray-3 bg-surface-base text-transparent hover:border-ink-gray-5',
        selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ]"
      @click.stop="emit('toggle-select', folder.name)"
    >
      <LucideIcon name="check" class="h-3 w-3" />
    </button>
    <button class="flex flex-col items-center gap-2" @click="emit('open')">
      <LucideIcon name="folder" class="h-9 w-9 text-ink-gray-6" />
      <span class="max-w-[90%] truncate text-[13px] font-semibold text-ink-gray-9">{{ folder.folder_name || folder.name }}</span>
      <span class="text-[11px] text-ink-gray-5">{{ count }} item{{ count === 1 ? '' : 's' }}</span>
    </button>
  </div>
</template>
