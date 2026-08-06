<script setup>
// "Move to folder" dialog (#105) — a lightweight Drive folder browser. Opens on the
// owner's Drive Home, lists the sub-folders of the folder you're in (each clickable
// to descend), and an in-dialog breadcrumb walks back up. "Move here" drops the
// diagram's backing Drive file into the folder currently shown. Everything is
// permission-checked server-side; if Drive turns out to be unavailable the dialog
// says so and disables Move. Only ever mounted when Drive is available (OverflowMenu
// gates it), so the absent state is just belt-and-braces.
import { ref, computed, watch } from 'vue'
import { Button, Dialog, toast } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { listDriveFolders, moveToDriveFolder } from '@/data/drive.js'

const props = defineProps({
  diagramName: { type: String, required: true },
})
const show = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['moved'])

const loading = ref(false)
const moving = ref(false)
const error = ref('')
const driveInstalled = ref(true)
const current = ref(null)
const path = ref([])
const folders = ref([])

// The folder "Move here" targets — the last breadcrumb crumb, i.e. the folder shown.
const currentTitle = computed(() => path.value[path.value.length - 1]?.title || 'Home')
const canMove = computed(() => driveInstalled.value && !loading.value && !moving.value)

// Load Home fresh each time the dialog opens (folders may have changed since last).
watch(show, (open) => {
  if (open) load(null)
})

async function load(parent) {
  loading.value = true
  error.value = ''
  try {
    const res = await listDriveFolders(parent)
    driveInstalled.value = res?.drive_installed !== false
    if (!driveInstalled.value) {
      current.value = null
      path.value = []
      folders.value = []
      return
    }
    current.value = res.current
    path.value = res.path || []
    folders.value = res.folders || []
  } catch (e) {
    error.value = e?.message || 'Could not load folders.'
  } finally {
    loading.value = false
  }
}

// Descend into a sub-folder, or jump to an ancestor via the breadcrumb.
function openFolder(name) {
  if (!loading.value && !moving.value) load(name)
}

async function moveHere() {
  if (!canMove.value) return
  moving.value = true
  error.value = ''
  try {
    await moveToDriveFolder(props.diagramName, current.value)
    emit('moved', { folder: current.value, title: currentTitle.value })
    show.value = false
  } catch (e) {
    // move()'s own permission / not-a-folder errors land here — surface them inline.
    error.value = e?.message || 'Could not move the diagram.'
    toast.error('Could not move', { text: error.value })
  } finally {
    moving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="show" title="Move to folder">
    <template #default>
      <div class="flex flex-col gap-3">
        <!-- Breadcrumb: Home down to the folder being viewed; crumbs jump up the tree. -->
        <nav v-if="driveInstalled" class="flex flex-wrap items-center gap-0.5 text-[13px]" aria-label="Folder path">
          <template v-for="(crumb, i) in path" :key="crumb.name">
            <LucideIcon v-if="i > 0" name="chevron-right" class="h-3.5 w-3.5 flex-none text-ink-gray-4" />
            <button
              type="button"
              class="max-w-[160px] truncate rounded px-1.5 py-0.5 hover:bg-surface-gray-2"
              :class="i === path.length - 1 ? 'font-medium text-ink-gray-8' : 'text-ink-gray-6'"
              :disabled="i === path.length - 1"
              @click="openFolder(crumb.name)"
            >
              {{ crumb.title }}
            </button>
          </template>
        </nav>

        <!-- Folder list -->
        <div class="min-h-[8rem] rounded-md border border-outline-gray-2">
          <p v-if="!driveInstalled" class="px-3 py-8 text-center text-[13px] text-ink-gray-5">
            Frappe Drive isn't available, so there are no folders to move into.
          </p>
          <p v-else-if="loading" class="px-3 py-8 text-center text-[13px] text-ink-gray-5">Loading…</p>
          <p v-else-if="error" class="px-3 py-8 text-center text-[13px] text-ink-red-6">{{ error }}</p>
          <p v-else-if="!folders.length" class="px-3 py-8 text-center text-[13px] text-ink-gray-5">
            No subfolders here.
          </p>
          <ul v-else class="max-h-64 overflow-auto py-1">
            <li v-for="folder in folders" :key="folder.name">
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-gray-2"
                @click="openFolder(folder.name)"
              >
                <LucideIcon name="folder" class="h-4 w-4 flex-none text-ink-gray-5" />
                <span class="min-w-0 flex-1 truncate text-[13px] text-ink-gray-8">{{ folder.title }}</span>
                <LucideIcon name="chevron-right" class="h-4 w-4 flex-none text-ink-gray-4" />
              </button>
            </li>
          </ul>
        </div>

        <!-- Footer: move into the folder currently shown. -->
        <div class="flex items-center justify-end gap-2 border-t border-outline-gray-1 pt-3">
          <Button variant="subtle" @click="show = false">Cancel</Button>
          <Button variant="solid" :loading="moving" :disabled="!canMove" @click="moveHere">
            Move here
          </Button>
        </div>
      </div>
    </template>
  </Dialog>
</template>
