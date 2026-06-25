<script setup>
// A right-click context menu positioned at the cursor. Items are
// { label, icon?, shortcut?, danger?, disabled?, divider?, onClick }. Closes on
// item click, Escape, or a pointer-down outside. Teleported to body so canvas
// overflow never clips it; clamped to stay on screen.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { FeatherIcon } from 'frappe-ui'

const props = defineProps({
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array, default: () => [] },
})
const emit = defineEmits(['close'])

const root = ref(null)
const MENU_W = 200

const position = computed(() => ({
  left: Math.min(props.x, window.innerWidth - MENU_W - 8) + 'px',
  top: Math.min(props.y, window.innerHeight - props.items.length * 32 - 16) + 'px',
}))

function choose(item) {
  if (item.disabled || item.divider) return
  item.onClick?.()
  emit('close')
}

function onKey(event) {
  if (event.key === 'Escape') emit('close')
}
function onAway(event) {
  if (root.value && !root.value.contains(event.target)) emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', onAway, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', onAway, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="fixed z-50 min-w-[200px] rounded-lg border border-outline-gray-2 bg-surface-white py-1 shadow-lg"
      :style="position"
    >
      <template v-for="(item, index) in items" :key="index">
        <div v-if="item.divider" class="my-1 h-px bg-outline-gray-1" />
        <button
          v-else
          class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] disabled:opacity-40"
          :class="item.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-gray-8 hover:bg-surface-gray-2'"
          :disabled="item.disabled"
          @click="choose(item)"
        >
          <FeatherIcon v-if="item.icon" :name="item.icon" class="h-4 w-4" />
          <span>{{ item.label }}</span>
          <span v-if="item.shortcut" class="ml-auto pl-6 text-[11px] text-ink-gray-4">{{ item.shortcut }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
