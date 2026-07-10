<script setup>
// Home sidebar, built on frappe-ui's official <Sidebar> so it matches Drive /
// Writer (header block with logo + user + menu, sections, icon-rail collapse).
// Nav (Home/Recent/All/Trash) + a Folders section (add / rename / delete). Items
// render through the #sidebar-item slot using frappe-ui's SidebarItem with
// lucide icons, so the whole thing keeps the standard Frappe look and feel.
import { ref, computed, onMounted } from 'vue'
import { Sidebar, SidebarItem, Dropdown, Dialog, Button, FormControl } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import Logomark from '@/components/Logomark.vue'
import SettingsDialog from '@/components/home/SettingsDialog.vue'
import { folders, renameFolder, deleteFolder } from '@/data/folders.js'

const props = defineProps({
  active: { type: String, default: 'all' },
})
const emit = defineEmits(['navigate'])

const collapsed = ref(false)
const showSettings = ref(false)

onMounted(() => folders.fetch())

// Real logged-in user, injected into the page boot by www/draw.py.
const fullName = computed(() => window.full_name || 'You')

// Header dropdown (Settings + Log out), matching Drive's header menu.
const header = computed(() => ({
  title: 'Frappe Draw',
  subtitle: fullName.value,
  menuItems: [
    { label: 'Settings', icon: 'settings', onClick: () => (showSettings.value = true) },
    { label: 'Log out', icon: 'log-out', onClick: () => (window.location.href = '/api/method/logout') },
  ],
}))

const NAV = [
  { type: 'nav', key: 'home', label: 'Home', feather: 'home' },
  { type: 'nav', key: 'recent', label: 'Recent', feather: 'clock' },
  { type: 'nav', key: 'all', label: 'All diagrams', feather: 'layers' },
  { type: 'nav', key: 'trash', label: 'Trash', feather: 'trash-2' },
]

// Only top-level folders in the sidebar; nesting is browsed in the explorer.
// The sidebar only LISTS folders — creation lives in the top-right CTA (A2).
const topFolders = computed(() => (folders.data || []).filter((folder) => !folder.parent_folder))

const folderItems = computed(() =>
  topFolders.value.map((folder) => ({
    type: 'folder',
    folder,
    label: folder.folder_name || folder.name,
    feather: 'folder',
  })),
)

// Two sections: unlabeled nav, then Folders. `label` on items keys the section list.
const sections = computed(() => [
  { items: NAV },
  { label: 'Folders', items: folderItems.value },
])

// --- rename via a small dialog (Frappe-consistent) -------------------------
const dialog = ref({ open: false, value: '', folder: null })
function openRename(folder) {
  dialog.value = { open: true, value: folder.folder_name || folder.name, folder }
}
async function saveFolder() {
  const name = dialog.value.value.trim()
  if (name) await renameFolder(dialog.value.folder.name, name)
  dialog.value.open = false
}
function removeFolder(folder) {
  return deleteFolder(folder.name)
}

function onItemClick(item) {
  if (item.type === 'folder') return emit('navigate', 'home')
  emit('navigate', item.key)
}
</script>

<template>
  <Sidebar v-model:collapsed="collapsed" :header="header" :sections="sections">
    <template #header-logo>
      <div class="flex h-full w-full items-center justify-center">
        <Logomark :size="26" />
      </div>
    </template>

    <template #sidebar-item="{ item, isCollapsed }">
      <!-- Folder row: SidebarItem + a ⋯ menu suffix (rename / delete). -->
      <SidebarItem
        v-if="item.type === 'folder'"
        :label="item.label"
        :is-collapsed="isCollapsed"
        :on-click="() => onItemClick(item)"
      >
        <template #icon><LucideIcon :name="item.feather" class="size-4 text-ink-gray-6" /></template>
        <template #suffix>
          <Dropdown
            :options="[
              { label: 'Rename', icon: 'edit-2', onClick: () => openRename(item.folder) },
              { label: 'Delete folder', icon: 'trash-2', onClick: () => removeFolder(item.folder) },
            ]"
            placement="right-start"
          >
            <button class="flex h-5 w-5 items-center justify-center rounded text-ink-gray-5 hover:bg-surface-gray-3" @click.stop>
              <LucideIcon name="more-horizontal" class="h-4 w-4" />
            </button>
          </Dropdown>
        </template>
      </SidebarItem>

      <!-- Nav + "New folder" rows. -->
      <SidebarItem
        v-else
        :label="item.label"
        :is-active="item.type === 'nav' && props.active === item.key"
        :is-collapsed="isCollapsed"
        :on-click="() => onItemClick(item)"
      >
        <template #icon><LucideIcon :name="item.feather" class="size-4 text-ink-gray-6" /></template>
      </SidebarItem>
    </template>
  </Sidebar>

  <SettingsDialog v-model="showSettings" />

  <Dialog v-model="dialog.open" :options="{ title: 'Rename folder' }">
    <template #body-content>
      <FormControl
        type="text"
        label="Folder name"
        v-model="dialog.value"
        @keydown.enter="saveFolder"
      />
    </template>
    <template #actions>
      <Button variant="solid" @click="saveFolder">Save</Button>
    </template>
  </Dialog>
</template>
