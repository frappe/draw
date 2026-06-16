<script setup>
// Trash view (spec §2, README §3): amber warning banner + grid of trashed
// diagrams with Restore/Delete. Stub: the feature agent loads trashed diagrams
// and wires restore/permanent-delete.
import { FeatherIcon } from 'frappe-ui'
</script>

<template>
  <div>
    <h1 class="mb-4 text-[22px] font-bold text-ink-gray-9">Trash</h1>
    <div
      class="flex items-center gap-2 rounded-[10px] border border-outline-amber-2 bg-surface-amber-1 px-3 py-2.5 text-[13px] text-ink-amber-3"
    >
      <FeatherIcon name="alert-triangle" class="h-4 w-4" />
      Items in trash are permanently deleted after 30 days.
    </div>
  </div>
</template>
