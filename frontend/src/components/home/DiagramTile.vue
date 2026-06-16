<script setup>
// One diagram tile (spec §2, README "Home dashboard"): a 120px live SVG
// thumbnail, title + edited-time footer, and a hover-revealed ⋯ menu
// (Rename / Edit description / Duplicate / Delete → trash, no confirmation).
import { computed } from 'vue'
import { Dropdown, FeatherIcon } from 'frappe-ui'
import { documentToSvg, isDocumentEmpty } from '@/composables/useThumbnail.js'

const props = defineProps({
  diagram: { type: Object, required: true },
})
const emit = defineEmits(['open', 'rename', 'edit-description', 'duplicate', 'delete'])

// Prefer the live document preview; fall back to a stored thumbnail image.
const previewSvg = computed(() => {
  const document = props.diagram.document
  if (!document || isDocumentEmpty(document)) return null
  return documentToSvg(document)
})

const editedLabel = computed(() => relativeTime(props.diagram.modified))

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
  <div
    class="group relative overflow-hidden rounded-xl border border-outline-gray-1 bg-surface-white text-left"
    draggable="true"
    @dragstart="onDragStart"
  >
    <button class="block w-full" @click="emit('open', diagram.name)">
      <div class="flex h-[120px] items-center justify-center border-b border-outline-gray-1 bg-surface-white p-2">
        <div
          v-if="previewSvg"
          class="h-full w-full [&>svg]:h-full [&>svg]:w-full"
          v-html="previewSvg"
        />
        <FeatherIcon v-else name="image" class="h-7 w-7 text-ink-gray-3" />
      </div>
    </button>

    <div class="flex items-center gap-1 px-3 py-2.5">
      <button class="min-w-0 flex-1 text-left" @click="emit('open', diagram.name)">
        <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ diagram.title }}</div>
        <div class="text-[11px] text-ink-gray-5">{{ editedLabel }}</div>
      </button>

      <Dropdown :options="menuItems" placement="right">
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
