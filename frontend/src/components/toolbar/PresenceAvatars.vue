<script setup>
// Presence avatar stack in the toolbar (spec 11.3), built the way Frappe Writer
// builds it (UsersBar): stacked frappe-ui <Avatar>s where each person's identity
// colour is the avatar's BORDER, not its fill, so the avatar itself keeps the
// neutral surface/ink tokens. Overflow collapses into a "+N" chip, and the whole
// stack is a <Dropdown> trigger opening the full roster.
//
// Shows the OTHER live co-viewers (Frappe realtime) — not yourself. You don't
// need to see your own avatar, and showing nothing when you're alone keeps the
// bar clean (#109). usePresence is still called so peers see you.
import { computed, h } from 'vue'
import { Avatar, Button, Dropdown } from 'frappe-ui'
import { useRoute } from 'vue-router'
import { usePresence } from '@/composables/usePresence.js'

const route = useRoute()
const { peers } = usePresence(route.params.name)

// Writer shows three before collapsing; the rest live in the dropdown roster.
const MAX = 3

// Identity colours are deliberately literal, not tokens: they mark WHO someone
// is, so they must stay stable across light and dark mode (same reasoning as the
// canvas exception in CONVENTIONS.md §2). They are only ever a border colour.
const IDENTITY_COLORS = ['#6846E3', '#0A84FF', '#16A34A', '#D97706', '#DB2777', '#0E7490']

// Deterministic per-user colour, so the same person keeps the same ring across
// sessions and across peers.
function colorFor(key) {
  let hash = 0
  for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return IDENTITY_COLORS[hash % IDENTITY_COLORS.length]
}

const everyone = computed(() =>
  peers.value.map((peer) => ({
    id: peer.id,
    identity: peer.identity,
    color: colorFor(peer.id),
  })),
)

const visible = computed(() => everyone.value.slice(0, MAX))
const overflow = computed(() => Math.max(0, everyone.value.length - MAX))

// Roster rows carry an Avatar, which Dropdown's label/icon pair cannot express,
// so they render through its `component` option instead.
const rosterOptions = computed(() =>
  everyone.value.map((person) => ({
    label: person.identity,
    component: () =>
      h('div', { class: 'flex items-center gap-2 px-2 py-1.5' }, [
        h(Avatar, {
          size: 'sm',
          label: person.identity,
          class: 'border-[1.5px]',
          style: { borderColor: person.color },
        }),
        h('span', { class: 'truncate text-base text-ink-gray-8' }, person.identity),
      ]),
  })),
)
</script>

<template>
  <Dropdown v-if="everyone.length" :options="rosterOptions">
    <!-- The stack itself is the trigger. It rides Button's `#icon` slot, which is
         the icon-button path, so the label stays an accessible name rather than
         visible text; the width override lets the stack size itself. -->
    <Button
      variant="ghost"
      theme="gray"
      size="lg"
      class="!h-auto !w-auto !px-1"
      :label="`${everyone.length} ${everyone.length === 1 ? 'person' : 'people'} viewing`"
    >
      <template #icon>
        <span class="flex items-center">
          <Avatar
            v-for="(person, index) in visible"
            :key="person.id"
            size="md"
            :label="person.identity"
            class="border-[1.5px]"
            :class="index > 0 ? '-ml-2.5' : ''"
            :style="{ borderColor: person.color }"
          />
          <span
            v-if="overflow > 0"
            class="-ml-2.5 flex size-7 select-none items-center justify-center rounded-full bg-surface-gray-2 text-sm font-medium text-ink-gray-5"
          >
            +{{ overflow }}
          </span>
        </span>
      </template>
    </Button>
  </Dropdown>
</template>
