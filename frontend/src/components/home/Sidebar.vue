<script setup>
// Home sidebar (240px, README "Home dashboard"): brand, search, nav, folders,
// user footer. Nav emits view changes; folders compose FolderSection.
import { FeatherIcon } from 'frappe-ui'
import Logomark from '@/components/Logomark.vue'
import FolderSection from './FolderSection.vue'

defineProps({
  active: { type: String, default: 'all' },
})
const emit = defineEmits(['navigate'])

const nav = [
  { key: 'all', icon: 'grid', label: 'All diagrams' },
  { key: 'shared', icon: 'users', label: 'Shared with me' },
  { key: 'trash', icon: 'trash-2', label: 'Trash' },
]
</script>

<template>
  <aside
    class="flex w-60 flex-none flex-col border-r border-outline-gray-1 bg-surface-gray-1 px-3 py-3.5"
  >
    <div class="mb-4 flex items-center gap-2">
      <Logomark :size="26" />
      <span class="text-[15px] font-bold text-ink-gray-9">Frappe Draw</span>
    </div>

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

    <FolderSection class="mt-4" />

    <div class="mt-auto flex items-center gap-2 border-t border-outline-gray-1 pt-3">
      <div
        class="flex h-7 w-7 items-center justify-center rounded-full bg-[#6846E3] text-xs font-semibold text-white"
      >
        TS
      </div>
      <div class="leading-tight">
        <div class="text-[13px] font-medium text-ink-gray-9">Tarun S.</div>
        <div class="text-[11px] text-ink-gray-5">Frappe Cloud</div>
      </div>
    </div>
  </aside>
</template>
