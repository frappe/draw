<script setup>
// Home sidebar (240px, README "Home dashboard"): violet logomark + wordmark,
// search input, nav (All / Shared / Trash), a Folders list with an add button,
// and the user footer. Nav clicks emit a view change; folder clicks emit a
// folder filter. In Trash view it collapses to a brand row + a back link.
import { ref, onMounted } from 'vue'
import { FeatherIcon, TextInput } from 'frappe-ui'
import Logomark from '@/components/Logomark.vue'
import { folders, createFolder } from '@/data/folders.js'

defineProps({
  active: { type: String, default: 'all' },
})
const emit = defineEmits(['navigate', 'search'])

const adding = ref(false)
const newFolderName = ref('')

onMounted(() => folders.fetch())

const nav = [
  { key: 'all', icon: 'grid', label: 'All diagrams' },
  { key: 'shared', icon: 'users', label: 'Shared with me' },
  { key: 'trash', icon: 'trash-2', label: 'Trash' },
]

async function confirmAddFolder() {
  const name = newFolderName.value.trim()
  if (name) await createFolder(name)
  newFolderName.value = ''
  adding.value = false
}
</script>

<template>
  <aside class="flex w-60 flex-none flex-col border-r border-outline-gray-1 bg-surface-gray-1 px-3 py-3.5">
    <!-- Trash view: collapse the sidebar to a brand row + a back link. -->
    <template v-if="active === 'trash'">
      <div class="mb-4 flex items-center gap-2">
        <Logomark :size="26" />
        <span class="text-[15px] font-bold text-ink-gray-9">Frappe Draw</span>
      </div>
      <button
        class="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-gray-7 hover:bg-surface-gray-2"
        @click="emit('navigate', 'all')"
      >
        <FeatherIcon name="arrow-left" class="h-4 w-4" />
        Back to diagrams
      </button>
    </template>

    <template v-else>
      <div class="mb-4 flex items-center gap-2">
        <Logomark :size="26" />
        <span class="text-[15px] font-bold text-ink-gray-9">Frappe Draw</span>
      </div>

      <TextInput
        type="text"
        placeholder="Search diagrams"
        class="mb-3"
        @input="emit('search', $event.target.value)"
      >
        <template #prefix><FeatherIcon name="search" class="h-3.5 w-3.5 text-ink-gray-5" /></template>
      </TextInput>

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
          <button class="text-ink-gray-5 hover:text-ink-gray-7" @click="adding = true">
            <FeatherIcon name="plus" class="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          v-for="folder in folders.data || []"
          :key="folder.name"
          class="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-gray-7 hover:bg-surface-gray-2"
          @click="emit('navigate', 'all')"
        >
          <FeatherIcon name="folder" class="h-4 w-4" />
          {{ folder.folder_name || folder.name }}
        </button>
        <TextInput
          v-if="adding"
          type="text"
          placeholder="Folder name"
          class="mt-1"
          v-model="newFolderName"
          @keydown.enter="confirmAddFolder"
          @blur="confirmAddFolder"
        />
      </div>
    </template>

    <div class="mt-auto flex items-center gap-2 border-t border-outline-gray-1 pt-3">
      <div class="flex h-7 w-7 items-center justify-center rounded-full bg-[#6846E3] text-xs font-semibold text-white">
        TS
      </div>
      <div class="leading-tight">
        <div class="text-[13px] font-medium text-ink-gray-9">Tarun S.</div>
        <div class="text-[11px] text-ink-gray-5">Frappe Cloud</div>
      </div>
    </div>
  </aside>
</template>
