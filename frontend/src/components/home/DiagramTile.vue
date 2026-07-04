<script setup>
// One diagram, rendered as a grid tile or a compact list row (spec §2). Tiles
// show a live thumbnail; list rows show the diagram-type icon instead. Both
// carry the title, created + edited times, a selection checkbox, and a ⋯ menu
// (Pin/Unpin · Rename · Duplicate · Delete).
import { computed } from 'vue'
import { Dropdown, toast } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { documentToSvg, isDocumentEmpty } from '@/composables/useThumbnail.js'
import { typeIcon, typeLabel } from '@/data/diagramTypes.js'

const props = defineProps({
  diagram: { type: Object, required: true },
  view: { type: String, default: 'tile' }, // 'tile' | 'list'
  selected: { type: Boolean, default: false },
  selectionActive: { type: Boolean, default: false },
  pinLimitReached: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'toggle-select', 'toggle-pin', 'rename', 'duplicate', 'delete'])

const previewSvg = computed(() => {
  const document = props.diagram.document
  if (!document || isDocumentEmpty(document)) return null
  return documentToSvg(document)
})

const icon = computed(() => typeIcon(props.diagram.diagram_type))
const typeName = computed(() => typeLabel(props.diagram.diagram_type))
const isPinned = computed(() => Boolean(props.diagram.is_pinned))
const createdLabel = computed(() => relativeTime(props.diagram.creation))
const editedLabel = computed(() => relativeTime(props.diagram.modified))
// Owner column (I3): friendly name — drop the @domain from a user-id email.
const ownerLabel = computed(() => {
  const owner = props.diagram.owner || ''
  return owner.includes('@') ? owner.split('@')[0] : owner
})

// Pinning is capped (5). An unpinned diagram can't be pinned once the cap is
// hit — its menu item greys out and says why.
const pinBlocked = computed(() => !isPinned.value && props.pinLimitReached)

// Curated ⋯ menu (Drive-style, I5): pin/unpin, copy link, rename, duplicate,
// delete. (Move / Show info / Share need dedicated dialogs — tracked separately.)
const menuItems = computed(() => [
  {
    label: isPinned.value ? 'Unpin' : 'Pinned',
    icon: 'pin',
    onClick: togglePin,
  },
  { label: 'Copy link', icon: 'link', onClick: copyLink },
  { label: 'Rename', icon: 'edit-2', onClick: () => emit('rename', props.diagram) },
  { label: 'Duplicate', icon: 'copy', onClick: () => emit('duplicate', props.diagram) },
  { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: () => emit('delete', props.diagram) },
])

// Copy the diagram's editor link to the clipboard (spec I5, "under sharing").
function copyLink() {
  const url = `${window.location.origin}/frappe_draw/d/${props.diagram.name}`
  navigator.clipboard?.writeText(url).then(
    () => toast.success('Link copied'),
    () => toast.error('Could not copy link'),
  )
}

// The star's title/behaviour depends on whether pinning is still allowed (cap 5).
const pinTitle = computed(() =>
  isPinned.value ? 'Unpin' : pinBlocked.value ? 'Pin limit reached (max 5)' : 'Pin',
)
function togglePin() {
  if (!pinBlocked.value) emit('toggle-pin', props.diagram)
}

// Compact "3h ago" style label from an ISO/Frappe datetime string.
function relativeTime(value) {
  if (!value) return '—'
  const elapsedSeconds = (Date.now() - new Date(value.replace(' ', 'T')).getTime()) / 1000
  for (const [limit, divisor, unit] of TIME_UNITS) {
    if (elapsedSeconds < limit) return `${Math.max(1, Math.round(elapsedSeconds / divisor))}${unit} ago`
  }
  return 'just now'
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
    class="group relative flex items-center gap-3 rounded-lg border px-3 py-1.5"
    :class="selected ? 'border-outline-blue-2 bg-surface-blue-1' : 'border-outline-gray-1 bg-surface-base hover:bg-surface-gray-1'"
    draggable="true"
    @dragstart="onDragStart"
  >
    <!-- List-view select checkbox is always visible (Drive-style, I2). -->
    <button
      class="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border"
      :class="selected ? 'border-outline-blue-3 bg-surface-blue-3 text-white' : 'border-outline-gray-3 text-transparent hover:border-ink-gray-5'"
      @click.stop="emit('toggle-select', diagram.name)"
    >
      <LucideIcon name="check" class="h-3 w-3" />
    </button>

    <!-- One-click star (Gmail-style pin). -->
    <button
      class="flex h-6 w-6 flex-none items-center justify-center rounded hover:bg-surface-gray-2 disabled:cursor-not-allowed disabled:opacity-40"
      :title="pinTitle"
      :aria-label="pinTitle"
      :disabled="pinBlocked"
      @click.stop="togglePin"
    >
      <LucideIcon
        name="pin"
        class="h-4 w-4"
        :class="isPinned ? 'fill-amber-400 text-amber-400' : 'text-ink-gray-4 hover:text-ink-gray-6'"
      />
    </button>

    <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="emit('open', diagram.name)">
      <div class="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-surface-gray-2 text-ink-gray-7">
        <LucideIcon :name="icon" class="h-4 w-4" />
      </div>
      <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-gray-9">
        {{ diagram.title }}
      </span>
      <span class="hidden w-28 flex-none truncate text-[11px] text-ink-gray-5 lg:inline">{{ ownerLabel }}</span>
      <span class="hidden w-28 flex-none text-[11px] text-ink-gray-5 md:inline">Created {{ createdLabel }}</span>
      <span class="hidden w-28 flex-none text-[11px] text-ink-gray-5 sm:inline">Edited {{ editedLabel }}</span>
    </button>

    <Dropdown :options="menuItems" placement="bottom-end">
      <button class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2" @click.stop>
        <LucideIcon name="more-horizontal" class="h-4 w-4" />
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
        selected ? 'border-outline-blue-3 bg-surface-blue-3 text-white' : 'border-outline-gray-3 bg-surface-base text-transparent',
        selected || selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ]"
      @click.stop="emit('toggle-select', diagram.name)"
    >
      <LucideIcon name="check" class="h-3 w-3" />
    </button>

    <!-- One-click star (Gmail-style pin): always shown when pinned, on hover otherwise. -->
    <button
      class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-surface-base/80 shadow-sm backdrop-blur transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      :class="isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      :title="pinTitle"
      :aria-label="pinTitle"
      :disabled="pinBlocked"
      @click.stop="togglePin"
    >
      <LucideIcon
        name="pin"
        class="h-4 w-4"
        :class="isPinned ? 'fill-amber-400 text-amber-400' : 'text-ink-gray-5'"
      />
    </button>

    <button class="block w-full" @click="emit('open', diagram.name)">
      <!-- Fixed light background so the thumbnail is a true preview of the
           diagram canvas (which is light), never recolored by dark mode. -->
      <div
        class="flex h-[120px] items-center justify-center border-b border-outline-gray-1 p-2"
        style="background-color: #ffffff"
      >
        <div v-if="previewSvg" class="h-full w-full [&>svg]:h-full [&>svg]:w-full" v-html="previewSvg" />
        <LucideIcon v-else :name="icon" class="h-7 w-7 text-ink-gray-3" />
      </div>
    </button>

    <div class="flex items-center gap-1 bg-surface-base px-3 py-2.5">
      <button class="min-w-0 flex-1 text-left" @click="emit('open', diagram.name)">
        <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ diagram.title }}</div>
        <div class="text-[11px] text-ink-gray-5">Created {{ createdLabel }} · Edited {{ editedLabel }}</div>
      </button>

      <Dropdown :options="menuItems" placement="bottom-end">
        <button
          class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-ink-gray-5 opacity-0 hover:bg-surface-gray-2 group-hover:opacity-100"
          @click.stop
        >
          <LucideIcon name="more-horizontal" class="h-4 w-4" />
        </button>
      </Dropdown>
    </div>
  </div>
</template>
