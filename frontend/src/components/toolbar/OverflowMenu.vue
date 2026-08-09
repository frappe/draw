<script setup>
// Editor "…" overflow menu (#111). Sits after Export + Share in the top bar and
// gathers the less-frequent document actions Drive / Writer tuck under a kebab:
// Rename (re-enters the inline TitleEditor), Show info (name / created / modified /
// owner), Favourite/Pin (toggles is_pinned), and Delete (move to Trash). Loads its
// own copy of the diagram doc the same way ShareMenu does — from the route param —
// so the toolbar itself stays prop-light. The item set lives in overflowMenu.js so
// it can be unit-tested without mounting this component.
//
// Move … and Version history … are intentionally omitted — see overflowMenu.js.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Dialog, Dropdown, toast } from 'frappe-ui'
import { loadDiagram } from '@/data/diagrams.js'
import { getDriveAvailability } from '@/data/drive.js'
import { overflowMenuItems } from './overflowMenu.js'
import MoveToDriveDialog from './MoveToDriveDialog.vue'

// Rename lives in the sibling TitleEditor (inline, in the breadcrumb), so we ask the
// parent toolbar to trigger it rather than duplicating the edit UI here.
const emit = defineEmits(['rename'])

const route = useRoute()
const router = useRouter()
const diagram = loadDiagram(route.params.name)

const isPinned = computed(() => Boolean(diagram.doc?.is_pinned))
const showInfo = ref(false)
const showMove = ref(false)

// "Move" only makes sense with a Drive to move into — probe availability the same way
// DriveMenu does, and stay hidden until it's confirmed present.
const driveAvailable = ref(false)
onMounted(async () => {
  const status = await getDriveAvailability()
  driveAvailable.value = !!status?.installed
})

const menuItems = computed(() =>
  overflowMenuItems({
    isPinned: isPinned.value,
    driveAvailable: driveAvailable.value,
    onRename: () => emit('rename'),
    onShowInfo: openInfo,
    onMove: () => (showMove.value = true),
    onTogglePin: togglePin,
    onDelete: trash,
  }),
)

// After a successful move, tell the user where it landed (parity with the other
// toolbar toasts).
function onMoved({ title } = {}) {
  toast.success('Moved to Drive', { text: title ? `Now in "${title}"` : '' })
}

// Reload before showing so "Last edited" (and a title/owner changed elsewhere) is
// current — this resource is loaded once on open and would otherwise be stale.
function openInfo() {
  diagram.reload()
  showInfo.value = true
}

async function togglePin() {
  try {
    await diagram.setValue.submit({ is_pinned: isPinned.value ? 0 : 1 })
  } catch (error) {
    toast.error('Could not update', { text: error?.message || '' })
  }
}

// Move to Trash, then leave the editor — a trashed diagram has no place in an open
// canvas. Mirrors TileGrid's trash action (is_trashed + trashed_on).
async function trash() {
  try {
    await diagram.setValue.submit({ is_trashed: 1, trashed_on: frappeNow() })
    router.push({ name: 'Home' })
  } catch (error) {
    toast.error('Could not move to Trash', { text: error?.message || '' })
  }
}

// Read-only metadata for the info dialog: name / owner / created / last edited.
const infoRows = computed(() => {
  const doc = diagram.doc || {}
  return [
    ['Name', doc.title || '—'],
    ['Owner', doc.owner || '—'],
    ['Created', fmtDate(doc.creation)],
    ['Last edited', fmtDate(doc.modified)],
  ]
})

// "2026-08-03 19:00:00" -> "2026-08-03 · 19:00" (matches TileGrid's info dialog).
function fmtDate(value) {
  return value ? value.slice(0, 16).replace(' ', ' · ') : '—'
}
function frappeNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}
</script>

<template>
  <Dropdown :options="menuItems" placement="bottom-end">
    <!-- Same ghost icon button as its neighbours (#229), so the cluster reads as one set. -->
    <Button variant="ghost" icon="lucide-ellipsis" label="More actions" tooltip="More actions" />
  </Dropdown>

  <Dialog v-model:open="showInfo" title="Diagram info">
    <template #default>
      <dl class="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
        <template v-for="[label, value] in infoRows" :key="label">
          <dt class="text-ink-gray-5">{{ label }}</dt>
          <dd class="truncate text-ink-gray-8">{{ value }}</dd>
        </template>
      </dl>
    </template>
  </Dialog>

  <MoveToDriveDialog v-model="showMove" :diagram-name="route.params.name" @moved="onMoved" />
</template>
