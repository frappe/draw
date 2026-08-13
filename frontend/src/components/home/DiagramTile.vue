<script setup>
// One diagram, rendered as a grid tile or a compact list row (spec §2). Tiles
// show a live thumbnail. List rows carry no glyph at all (#218): every diagram
// drew the same one, so it distinguished nothing and only pushed the titles
// right. Both carry the title, created + edited times, a selection checkbox,
// and a ⋯ menu (Pin/Unpin · Rename · Duplicate · Delete).
import { computed, ref, watch } from 'vue'
import { Checkbox, Dropdown, toast } from 'frappe-ui'
import { documentToSvg, isDocumentEmpty } from '@/composables/useThumbnail.js'
import PinIcon from './PinIcon.vue'

const props = defineProps({
  diagram: { type: Object, required: true },
  view: { type: String, default: 'tile' }, // 'tile' | 'list'
  selected: { type: Boolean, default: false },
  selectionActive: { type: Boolean, default: false },
  pinLimitReached: { type: Boolean, default: false },
})
// `select` carries the wanted state, not "flip it" (#405). frappe-ui's Checkbox
// emits update:modelValue TWICE per click — once from its `defineModel` setter and
// once from an explicit emit in the same handler — so a toggling listener ran an
// even number of times and selection never took. Setting a value is idempotent,
// which makes the duplicate harmless.
const emit = defineEmits(['open', 'select', 'toggle-pin', 'rename', 'duplicate', 'delete', 'show-info', 'collect'])

// A non-empty diagram ALWAYS shows a preview: the saved raster thumbnail when we
// have one (cheap), otherwise a live SVG rendered from the document. Only a truly
// blank canvas shows neither — it gets the "empty" text placeholder instead of a
// misleading preview or icon.
//
// Home no longer sends every diagram's document (#223) — it fetches them only for
// the diagrams with no raster, since a diagram emptied after a save has its
// thumbnail cleared. So `document` is undefined until that second request lands,
// which is NOT the same as blank: showing "Diagram is blank" in the meantime would
// flash the wrong answer on every tile that is about to draw a preview.
const documentKnown = computed(() => props.diagram.document !== undefined)
const isEmpty = computed(() => {
  const document = props.diagram.document
  return documentKnown.value && (!document || isDocumentEmpty(document))
})
// A stored thumbnail can outlive the File it points at: the diagram keeps the
// path after the attachment is gone, and the <img> then 404s. Because the raster
// wins over the live preview, that left an empty box on a diagram that renders
// perfectly well — "the thumbnail stopped rendering" (#221). Treat a failed load
// as "no raster" so the live SVG takes over. Reset when the path changes, since
// the next one may well be fine.
const thumbnailFailed = ref(false)
watch(
  () => props.diagram.thumbnail,
  () => (thumbnailFailed.value = false),
)

// A diagram emptied after a save has its thumbnail CLEARED by save_thumbnail now
// (#93, #223), so a stored raster means real content and is shown as-is. Home
// therefore never fetches a document for a tile that has one.
const thumbnailUrl = computed(() =>
  thumbnailFailed.value ? null : props.diagram.thumbnail || null,
)
const previewSvg = computed(() => {
  if (thumbnailUrl.value || isEmpty.value || !documentKnown.value) return null
  return documentToSvg(props.diagram.document)
})
// While the document is still on its way, draw an empty frame rather than claiming
// the diagram is blank.
const showsBlankLabel = computed(() => !thumbnailUrl.value && !previewSvg.value && documentKnown.value)

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
  // Collections are labels, so this ADDS to one rather than moving the diagram (#217).
  { label: 'Add to collection', icon: 'lucide-library-big', onClick: () => emit('collect', props.diagram) },
  { label: 'Copy link', icon: 'link', onClick: copyLink },
  { label: 'Show info', icon: 'file-text', onClick: () => emit('show-info', props.diagram) },
  { label: 'Rename', icon: 'edit-2', onClick: () => emit('rename', props.diagram) },
  { label: 'Duplicate', icon: 'copy', onClick: () => emit('duplicate', props.diagram) },
  { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: () => emit('delete', props.diagram) },
])

// Copy the diagram's editor link to the clipboard (spec I5, "under sharing").
function copyLink() {
  const url = `${window.location.origin}/draw/d/${props.diagram.name}`
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

</script>

<template>
  <!-- LIST ROW — flat, dense, Frappe-Drive style (#302): no card border, just a
       hairline separator + hover. Whole row opens (mouse); the title is a real
       button so the row is keyboard-reachable. Columns align with TileGrid's header. -->
  <div
    v-if="view === 'list'"
    class="group flex cursor-pointer items-center gap-3 border-b border-outline-gray-1 px-3 py-1.5"
    :class="selected ? 'bg-surface-gray-3' : 'hover:bg-surface-gray-2'"
    @click="emit('open', diagram.name)"
  >
    <!-- Select checkbox is always visible (Drive-style, I2). -->
    <Checkbox
      class="w-4 flex-none"
      size="sm"
      :model-value="selected"
      :aria-label="`Select ${diagram.title || 'Untitled'}`"
      @click.stop
      @update:model-value="(wanted) => emit('select', diagram.name, wanted)"
    />

    <!-- One-click star (Gmail-style pin). -->
    <button
      class="flex h-6 w-6 flex-none items-center justify-center rounded hover:bg-surface-gray-3 disabled:cursor-not-allowed disabled:opacity-40"
      :title="pinTitle"
      :aria-label="pinTitle"
      :disabled="pinBlocked"
      @click.stop="togglePin"
    >
      <PinIcon :pinned="isPinned" :class="isPinned ? 'text-ink-gray-8' : 'text-ink-gray-4 hover:text-ink-gray-6'" />
    </button>

    <button class="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink-gray-9" @click.stop="emit('open', diagram.name)">
      {{ diagram.title }}
    </button>
    <span class="hidden w-28 flex-none truncate text-2xs text-ink-gray-5 lg:block">{{ ownerLabel }}</span>
    <span class="hidden w-28 flex-none text-2xs text-ink-gray-5 md:block">{{ createdLabel }}</span>
    <span class="hidden w-28 flex-none text-2xs text-ink-gray-5 sm:block">{{ editedLabel }}</span>

    <Dropdown :options="menuItems" placement="bottom-end">
      <button
        :aria-label="`More actions for ${diagram.title}`"
        class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-3"
        @click.stop
      >
        <span class="lucide-ellipsis h-4 w-4" aria-hidden="true" />
      </button>
    </Dropdown>
  </div>

  <!-- GRID TILE -->
  <div
    v-else
    class="group relative overflow-hidden rounded-xl border text-left transition-shadow"
    :class="selected ? 'border-outline-blue-3 ring-1 ring-outline-blue-2' : 'border-outline-gray-1'"  >
    <Checkbox
      class="absolute left-2 top-2 z-10 transition-opacity"
      :class="selected || selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      size="sm"
      :model-value="selected"
      :aria-label="`Select ${diagram.title || 'Untitled'}`"
      @click.stop
      @update:model-value="(wanted) => emit('select', diagram.name, wanted)"
    />

    <!-- One-click star (Gmail-style pin): always shown when pinned, on hover otherwise. -->
    <button
      class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-surface-base/80 shadow-sm backdrop-blur transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      :class="isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      :title="pinTitle"
      :aria-label="pinTitle"
      :disabled="pinBlocked"
      @click.stop="togglePin"
    >
      <PinIcon :pinned="isPinned" :class="isPinned ? 'text-ink-gray-8' : 'text-ink-gray-5'" />
    </button>

    <button class="block w-full" @click="emit('open', diagram.name)">
      <!-- Fixed light background so the thumbnail is a true preview of the
           diagram canvas (which is light), never recolored by dark mode. -->
      <div
        class="flex h-[120px] items-center justify-center border-b border-outline-gray-1 p-2"
        style="background-color: #ffffff"
      >
        <img
          v-if="thumbnailUrl"
          :src="thumbnailUrl"
          alt=""
          loading="lazy"
          decoding="async"
          class="h-full w-full object-contain"
          @error="thumbnailFailed = true"
        />
        <div v-else-if="previewSvg" class="h-full w-full [&>svg]:h-full [&>svg]:w-full" v-html="previewSvg" />
        <span v-else-if="showsBlankLabel" class="text-2xs italic text-ink-gray-4">Diagram is blank</span>
      </div>
    </button>

    <div class="flex items-center gap-1 bg-surface-base px-3 py-2.5">
      <button class="min-w-0 flex-1 text-left" @click="emit('open', diagram.name)">
        <div class="truncate text-sm font-semibold text-ink-gray-9">{{ diagram.title }}</div>
        <div class="text-2xs text-ink-gray-5">Created {{ createdLabel }} · Edited {{ editedLabel }}</div>
      </button>

      <Dropdown :options="menuItems" placement="bottom-end">
        <button
          :aria-label="`More actions for ${diagram.title}`"
          class="flex h-[26px] w-[26px] items-center justify-center rounded-md text-ink-gray-5 opacity-0 hover:bg-surface-gray-2 group-hover:opacity-100"
          @click.stop
        >
          <span class="lucide-ellipsis h-4 w-4" aria-hidden="true" />
        </button>
      </Dropdown>
    </div>
  </div>
</template>
