<script setup>
// Sidebar folders list (spec §2 organization). Stub: renders the folders
// resource as nav rows + an add button. The feature agent wires creation and
// drag-to-file.
import { FeatherIcon } from 'frappe-ui'
import { folders } from '@/data/folders.js'
</script>

<template>
  <div>
    <div class="mb-1 flex items-center justify-between px-2">
      <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">
        Folders
      </span>
      <button class="text-ink-gray-5 hover:text-ink-gray-7">
        <FeatherIcon name="plus" class="h-3.5 w-3.5" />
      </button>
    </div>
    <button
      v-for="folder in folders.data || []"
      :key="folder.name"
      class="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-ink-gray-7 hover:bg-surface-gray-2"
    >
      <FeatherIcon name="folder" class="h-4 w-4" />
      {{ folder.title || folder.name }}
    </button>
  </div>
</template>
