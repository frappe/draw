<script setup>
// Home sidebar, built on frappe-ui's official <Sidebar> so it matches Drive /
// Writer (header block with logo + user + menu, sections, icon-rail collapse).
// Nav (Home/Recent/All/Trash) + a Folders section (add / rename / delete). Items
// render through the #sidebar-item slot using frappe-ui's SidebarItem with
// FeatherIcon, so the whole thing keeps the standard Frappe look and feel.
import { ref, computed, onMounted } from 'vue'
import { Sidebar, SidebarItem, Dropdown, Dialog, Button, FormControl, FeatherIcon } from 'frappe-ui'
import Logomark from '@/components/Logomark.vue'
import SettingsDialog from '@/components/home/SettingsDialog.vue'
import { folders, createFolder, renameFolder, deleteFolder } from '@/data/folders.js'

const props = defineProps({
  active: { type: String, default: 'all' },
})
const emit = defineEmits(['navigate'])

const collapsed = ref(false)
const showSettings = ref(false)

onMounted(() => folders.fetch())

// Real logged-in user, injected into the page boot by www/frappe_draw.py.
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
const topFolders = computed(() => (folders.data || []).filter((folder) => !folder.parent_folder))

const folderItems = computed(() => [
  ...topFolders.value.map((folder) => ({
    type: 'folder',
    folder,
    label: folder.folder_name || folder.name,
    feather: 'folder',
  })),
  { type: 'add', label: 'New folder', feather: 'plus' },
])

// Two sections: unlabeled nav, then Folders. `label` on items keys the section list.
const sections = computed(() => [
  { items: NAV },
  { label: 'Folders', items: folderItems.value },
])

// --- add / rename via a small dialog (Frappe-consistent) -------------------
const dialog = ref({ open: false, mode: 'new', value: '', folder: null })
function openNewFolder() {
  dialog.value = { open: true, mode: 'new', value: '', folder: null }
}
function openRename(folder) {
  dialog.value = { open: true, mode: 'rename', value: folder.folder_name || folder.name, folder }
}
async function saveFolder() {
  const name = dialog.value.value.trim()
  if (name) {
    if (dialog.value.mode === 'new') await createFolder(name)
    else await renameFolder(dialog.value.folder.name, name)
  }
  dialog.value.open = false
}
function removeFolder(folder) {
  return deleteFolder(folder.name)
}

function onItemClick(item) {
  if (item.type === 'add') return openNewFolder()
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
        <template #icon><FeatherIcon :name="item.feather" class="size-4 text-ink-gray-6" /></template>
        <template #suffix>
          <Dropdown
            :options="[
              { label: 'Rename', icon: 'edit-2', onClick: () => openRename(item.folder) },
              { label: 'Delete folder', icon: 'trash-2', onClick: () => removeFolder(item.folder) },
            ]"
            placement="right-start"
          >
            <button class="flex h-5 w-5 items-center justify-center rounded text-ink-gray-5 hover:bg-surface-gray-3" @click.stop>
              <FeatherIcon name="more-horizontal" class="h-4 w-4" />
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
        <template #icon><FeatherIcon :name="item.feather" class="size-4 text-ink-gray-6" /></template>
      </SidebarItem>
    </template>
  </Sidebar>

  <SettingsDialog v-model="showSettings" />

  <Dialog v-model="dialog.open" :options="{ title: dialog.mode === 'new' ? 'New folder' : 'Rename folder' }">
    <template #body-content>
      <FormControl
        type="text"
        label="Folder name"
        v-model="dialog.value"
        @keydown.enter="saveFolder"
      />
    </template>
    <template #actions>
      <Button variant="solid" @click="saveFolder">{{ dialog.mode === 'new' ? 'Create folder' : 'Save' }}</Button>
    </template>
  </Dialog>
</template>
