<script setup>
// Presence avatar stack in the toolbar (spec 11.3): the current user plus any
// live co-viewers (Frappe realtime). A deterministic colour per user keeps
// avatars recognisable; overflow collapses into a "+N" chip.
import { computed } from 'vue'
import { Tooltip } from 'frappe-ui'
import { useRoute } from 'vue-router'
import { usePresence, initialsOf } from '@/composables/usePresence.js'

const route = useRoute()
const { me, peers } = usePresence(route.params.name)

const MAX = 4
const palette = ['#6846E3', '#0A84FF', '#16A34A', '#D97706', '#DB2777', '#0E7490']

function colorFor(key) {
  let hash = 0
  for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}

// Me first, then peers. The tooltip shows each viewer's identity (login/email,
// or "Guest"); cap the visible avatars and show a "+N" overflow chip.
const avatars = computed(() => {
  const all = [
    { id: me.id, tip: `${me.identity} (you)`, initials: me.initials },
    ...peers.value.map((p) => ({ id: p.id, tip: p.identity, initials: initialsOf(p.identity) })),
  ]
  return all.slice(0, MAX)
})
const overflow = computed(() => Math.max(0, 1 + peers.value.length - MAX))
</script>

<template>
  <div class="flex items-center -space-x-1.5">
    <Tooltip v-for="a in avatars" :key="a.id" :text="a.tip">
      <div
        class="flex h-7 w-7 select-none items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-surface-white"
        :style="{ background: colorFor(a.id) }"
      >
        {{ a.initials }}
      </div>
    </Tooltip>
    <div
      v-if="overflow > 0"
      class="flex h-7 w-7 select-none items-center justify-center rounded-full bg-surface-gray-3 text-[11px] font-semibold text-ink-gray-7 ring-2 ring-surface-white"
    >
      +{{ overflow }}
    </div>
  </div>
</template>
