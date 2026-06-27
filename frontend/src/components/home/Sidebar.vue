<script setup>
// Home sidebar (240px). Drive-style header block at the top-left (logomark +
// app name + the real logged-in user, with a chevron menu), then search, nav
// (All diagrams / Trash), and a Folders list. Folders add inline (icon + name
// field, Enter to save) and each has a ⋯ menu to rename or delete.
import { ref, computed, nextTick, onMounted } from 'vue'
import { FeatherIcon, Dropdown } from 'frappe-ui'
import Logomark from '@/components/Logomark.vue'
import SettingsDialog from '@/components/home/SettingsDialog.vue'
import { folders, createFolder, renameFolder, deleteFolder } from '@/data/folders.js'

const showSettings = ref(false)

defineProps({
  active: { type: String, default: 'all' },
})
const emit = defineEmits(['navigate', 'collapse'])

onMounted(() => folders.fetch())

// Only top-level folders in the sidebar; nesting is browsed in the explorer.
const topFolders = computed(() => (folders.data || []).filter((folder) => !folder.parent_folder))

// Real logged-in user, injected into the page boot by www/frappe_draw.py.
const fullName = computed(() => window.full_name || 'You')
const userMenu = [
  { label: 'Log out', icon: 'log-out', onClick: () => (window.location.href = '/api/method/logout') },
]

const nav = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'recent', icon: 'clock', label: 'Recent' },
  { key: 'all', icon: 'layers', label: 'All diagrams' },
  { key: 'trash', icon: 'trash-2', label: 'Trash' },
]

// --- Folders: add + rename + delete --------------------------------------
const adding = ref(false)
const newFolderName = ref('')
const newFolderInput = ref(null)
const editingId = ref(null)
const editName = ref('')

function startAdd() {
  editingId.value = null
  adding.value = true
  nextTick(() => newFolderInput.value?.focus())
}

async function confirmAddFolder() {
  if (!adding.value) return
  const name = newFolderName.value.trim()
  adding.value = false
  newFolderName.value = ''
  if (name) await createFolder(name)
}

function cancelAdd() {
  adding.value = false
  newFolderName.value = ''
}

function startRename(folder) {
  adding.value = false
  editingId.value = folder.name
  editName.value = folder.folder_name || folder.name
  nextTick(() => document.querySelector('.fd-folder-rename')?.focus())
}

async function confirmRename(folder) {
  if (!editingId.value) return
  editingId.value = null
  const name = editName.value.trim()
  if (name && name !== (folder.folder_name || folder.name)) await renameFolder(folder.name, name)
}

function removeFolder(folder) {
  return deleteFolder(folder.name)
}
</script>

<template>
  <aside class="flex w-60 flex-none flex-col border-r border-outline-gray-1 bg-surface-gray-1 px-3 py-3">
    <!-- Brand + user (Drive-style), top-left. -->
    <Dropdown :options="userMenu" placement="bottom-start">
      <button class="mb-3 flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-surface-gray-2">
        <Logomark :size="32" />
        <div class="min-w-0 flex-1 leading-tight">
          <div class="truncate text-[14px] font-bold text-ink-gray-9">Frappe Draw</div>
          <div class="truncate text-[12px] text-ink-gray-5">{{ fullName }}</div>
        </div>
        <FeatherIcon name="chevron-down" class="h-4 w-4 shrink-0 text-ink-gray-5" />
      </button>
    </Dropdown>

    <template v-if="active === 'trash'">
      <button
        class="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-gray-7 hover:bg-surface-gray-2"
        @click="emit('navigate', 'home')"
      >
        <FeatherIcon name="arrow-left" class="h-4 w-4" />
        Back to diagrams
      </button>
    </template>

    <template v-else>
      <nav class="flex flex-col gap-0.5">
        <button
          v-for="item in nav"
          :key="item.key"
          class="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px]"
          :class="active === item.key
            ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
            : 'text-ink-gray-7 hover:bg-surface-gray-2'"
          @click="emit('navigate', item.key)"
        >
          <FeatherIcon :name="item.icon" class="h-4 w-4" />
          {{ item.label }}
        </button>
      </nav>

      <div class="mt-4">
        <div class="mb-1 flex items-center justify-between px-2">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Folders</span>
          <button class="text-ink-gray-5 hover:text-ink-gray-7" @click="startAdd">
            <FeatherIcon name="plus" class="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          v-for="folder in topFolders"
          :key="folder.name"
          class="group relative flex items-center"
        >
          <!-- Rename: folder icon + inline name field. -->
          <div v-if="editingId === folder.name" class="flex h-8 w-full items-center gap-2.5 rounded-md px-2">
            <FeatherIcon name="folder" class="h-4 w-4 shrink-0 text-ink-gray-5" />
            <input
              v-model="editName"
              class="fd-folder-rename w-full bg-transparent text-[13px] text-ink-gray-9 outline-none"
              @keydown.enter="confirmRename(folder)"
              @keydown.esc="editingId = null"
              @blur="confirmRename(folder)"
            />
          </div>
          <!-- Display: folder icon + name + ⋯ menu. -->
          <template v-else>
            <button
              class="flex h-8 flex-1 items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-gray-7 hover:bg-surface-gray-2"
              @click="emit('navigate', 'home')"
            >
              <FeatherIcon name="folder" class="h-4 w-4 shrink-0" />
              <span class="truncate">{{ folder.folder_name || folder.name }}</span>
            </button>
            <Dropdown
              :options="[
                { label: 'Rename', icon: 'edit-2', onClick: () => startRename(folder) },
                { label: 'Delete folder', icon: 'trash-2', onClick: () => removeFolder(folder) },
              ]"
              placement="right-start"
            >
              <button
                class="absolute right-1 flex h-6 w-6 items-center justify-center rounded text-ink-gray-5 opacity-0 hover:bg-surface-gray-3 group-hover:opacity-100"
              >
                <FeatherIcon name="more-horizontal" class="h-4 w-4" />
              </button>
            </Dropdown>
          </template>
        </div>

        <!-- New folder: folder icon + name field. -->
        <div v-if="adding" class="flex h-8 items-center gap-2.5 rounded-md px-2">
          <FeatherIcon name="folder" class="h-4 w-4 shrink-0 text-ink-gray-5" />
          <input
            ref="newFolderInput"
            v-model="newFolderName"
            placeholder="Folder name"
            class="w-full bg-transparent text-[13px] text-ink-gray-9 outline-none placeholder:text-ink-gray-4"
            @keydown.enter="confirmAddFolder"
            @keydown.esc="cancelAdd"
            @blur="confirmAddFolder"
          />
        </div>
      </div>
    </template>

    <!-- Settings + collapse, pinned to the bottom (Drive-style). -->
    <div class="mt-auto flex flex-col gap-0.5">
      <button
        class="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-gray-7 hover:bg-surface-gray-2"
        @click="showSettings = true"
      >
        <FeatherIcon name="settings" class="h-4 w-4" />
        Settings
      </button>
      <button
        class="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-gray-6 hover:bg-surface-gray-2"
        @click="emit('collapse')"
      >
        <FeatherIcon name="chevrons-left" class="h-4 w-4" />
        Collapse
      </button>
    </div>

    <SettingsDialog v-model="showSettings" />
  </aside>
</template>
