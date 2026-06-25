<script setup>
// One diagram, rendered as a grid tile or a compact list row (spec §2). Both
// carry a live SVG thumbnail, title + edited time, a type badge, a selection
// checkbox, and a ⋯ menu (Rename / Edit description / Duplicate / Delete).
import { computed } from 'vue'
import { Dropdown, FeatherIcon } from 'frappe-ui'
import { documentToSvg, isDocumentEmpty } from '@/composables/useThumbnail.js'
import { typeLabel } from '@/data/diagramTypes.js'

const props = defineProps({
  diagram: { type: Object, required: true },
  view: { type: String, default: 'tile' }, // 'tile' | 'list'
  selected: { type: Boolean, default: false },
  selectionActive: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'toggle-select', 'rename', 'edit-description', 'duplicate', 'delete'])

// Prefer the live document preview; fall back to a placeholder icon.
const previewSvg = computed(() => {
  const document = props.diagram.document
  if (!document || isDocumentEmpty(document)) return null
  return documentToSvg(document)
})

const editedLabel = computed(() => relativeTime(props.diagram.modified))
const typeName = computed(() => typeLabel(props.diagram.diagram_type))

const menuItems = computed(() => [
  { label: 'Rename', icon: 'edit-2', onClick: () => emit('rename', props.diagram) },
  { label: 'Edit description', icon: 'file-text', onClick: () => emit('edit-description', props.diagram) },
  { label: 'Duplicate', icon: 'copy', onClick: () => emit('duplicate', props.diagram) },
  { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: () => emit('delete', props.diagram) },
])

// Compact "Edited 3h ago" style label from an ISO/Frappe datetime string.
function relativeTime(value) {
  if (!value) return ''
  const elapsedSeconds = (Date.now() - new Date(value.replace(' ', 'T')).getTime()) / 1000
  for (const [limit, divisor, unit] of TIME_UNITS) {
    if (elapsedSeconds < limit) return `Edited ${Math.max(1, Math.round(elapsedSeconds / divisor))}${unit} ago`
  }
  return 'Edited just now'
}

const TIME_UNITS = [
  [60, 1, 's'],
  [3600, 60, 'm'],
  [86400, 3600, 'h'],
  [Infinity, 86400, 'd'],
]

function onDragStart(event) {
  event.dataTransfer.setData('text/diagram-name', props.diagram.name)
  event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <!-- LIST ROW -->
  <div
    v-if="view === 'list'"
    class="group relative flex items-center gap-3 rounded-lg border px-3 py-2"
    :class="selected ? 'border-outline-blue-2 bg-surface-blue-1' : 'border-outline-gray-1 bg-surface-white hover:bg-surface-gray-1'"
    draggable="true"
    @dragstart="onDragStart"
  >
    <button
      class="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border transition-opacity"
      :class="[
        selected ? 'border-outline-blue-3 bg-surface-blue-3 text-white' : 'border-outline-gray-3 text-transparent',
        selected || selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ]"
      @click.stop="emit('toggle-select', diagram.name)"
    >
      <FeatherIcon name="check" class="h-3 w-3" />
    </button>

    <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="emit('open', diagram.name)">
      <div class="flex h-9 w-12 flex-none items-center justify-center overflow-hidden rounded border border-outline-gray-1 bg-surface-white">
        <div v-if="previewSvg" class="h-full w-full [&>svg]:h-full [&>svg]:w-full" v-html="previewSvg" />
        <FeatherIcon v-else name="image" class="h-4 w-4 text-ink-gray-3" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-[13px] font-medium text-ink-gray-9">{{ diagram.title }}</div>
        <div class="truncate text-[11px] text-ink-gray-5">{{ diagram.description || '—' }}</div>
      </div>
      <span class="hidden flex-none rounded-full bg-surface-gray-2 px-2 py-0.5 text-[10px] font-medium text-ink-gray-6 sm:inline">{{ typeName }}</span>
      <span class="hidden w-28 flex-none text-[11px] text-ink-gray-5 md:inline">{{ editedLabel }}</span>
    </button>

    <Dropdown :options="menuItems" placement="bottom-end">
      <button class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2" @click.stop>
        <FeatherIcon name="more-horizontal" class="h-4 w-4" />
      </button>
    </Dropdown>
  </div>

  <!-- GRID TILE -->
  <div
    v-else
    class="group relative overflow-hidden rounded-xl border text-left transition-shadow"
    :class="selected ? 'border-outline-blue-3 ring-1 ring-outline-blue-2' : 'border-outline-gray-1'"
    draggable="true"
    @dragstart="onDragStart"
  >
    <button
      class="absolute left-2 top-2 z-10 flex h-[20px] w-[20px] items-center justify-center rounded-[6px] border shadow-sm transition-opacity"
      :class="[
        selected ? 'border-outline-blue-3 bg-surface-blue-3 text-white' : 'border-outline-gray-3 bg-surface-white text-transparent',
        selected || selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ]"
      @click.stop="emit('toggle-select', diagram.name)"
    >
      <FeatherIcon name="check" class="h-3 w-3" />
    </button>

    <button class="block w-full" @click="emit('open', diagram.name)">
      <div class="flex h-[120px] items-center justify-center border-b border-outline-gray-1 bg-surface-white p-2">
        <div v-if="previewSvg" class="h-full w-full [&>svg]:h-full [&>svg]:w-full" v-html="previewSvg" />
        <FeatherIcon v-else name="image" class="h-7 w-7 text-ink-gray-3" />
      </div>
    </button>

    <div class="flex items-center gap-1 bg-surface-white px-3 py-2.5">
      <button class="min-w-0 flex-1 text-left" @click="emit('open', diagram.name)">
        <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ diagram.title }}</div>
        <div class="text-[11px] text-ink-gray-5">{{ editedLabel }}</div>
      </button>

      <Dropdown :options="menuItems" placement="bottom-end">
        <button
          class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-ink-gray-5 opacity-0 hover:bg-surface-gray-2 group-hover:opacity-100"
          @click.stop
        >
          <FeatherIcon name="more-horizontal" class="h-4 w-4" />
        </button>
      </Dropdown>
    </div>
  </div>
</template>
