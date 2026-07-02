<script setup>
// Search/filter at the top of the left palette (spec §4.2). The 56px rail is
// narrow, so this is a search icon button that toggles a small overlay input.
// Typing filters the palette via update:query; Esc or empty closes it.
import { ref, nextTick } from 'vue'
import { Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'

const props = defineProps({
  query: { type: String, default: '' },
})
const emit = defineEmits(['update:query'])

const open = ref(false)
const input = ref(null)

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    input.value?.focus()
  } else {
    emit('update:query', '')
  }
}

function onInput(event) {
  emit('update:query', event.target.value)
}

function close() {
  open.value = false
  emit('update:query', '')
}
</script>

<template>
  <div class="relative">
    <Tooltip text="Search shapes">
      <button
        class="flex h-[38px] w-[38px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2"
        :class="open || query ? 'bg-surface-gray-2 text-ink-gray-9' : ''"
        aria-label="Search shapes"
        @click="toggle"
      >
        <LucideIcon name="search" class="h-[18px] w-[18px]" />
      </button>
    </Tooltip>

    <div
      v-if="open"
      class="absolute left-[44px] top-0 z-10 flex w-52 items-center gap-2 rounded-md border border-outline-gray-2 bg-surface-base px-2.5 py-1.5 shadow-lg"
    >
      <LucideIcon name="search" class="h-4 w-4 flex-none text-ink-gray-5" />
      <input
        ref="input"
        :value="query"
        type="text"
        placeholder="Filter shapes…"
        class="w-full border-0 bg-transparent p-0 text-base text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
        @input="onInput"
        @keydown.esc="close"
      />
    </div>
  </div>
</template>
