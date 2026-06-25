<script setup>
// Renders a set of diagrams in the active view (tile grid or list rows) and
// forwards every per-tile action up. The `append` slot lets a caller add a
// trailing item (e.g. the "New diagram" affordance) inside the same grid/list.
import DiagramTile from './DiagramTile.vue'

defineProps({
  diagrams: { type: Array, default: () => [] },
  view: { type: String, default: 'tile' },
  selected: { type: Object, default: () => new Set() },
  pinLimitReached: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'toggle-select', 'toggle-pin', 'rename', 'duplicate', 'delete'])

const TILE_COLS = 'grid-template-columns: repeat(auto-fill, minmax(224px, 1fr))'
</script>

<template>
  <div v-if="view === 'tile'" class="grid gap-[18px]" :style="TILE_COLS">
    <DiagramTile
      v-for="diagram in diagrams"
      :key="diagram.name"
      :diagram="diagram"
      :selected="selected.has(diagram.name)"
      :selection-active="selected.size > 0"
      :pin-limit-reached="pinLimitReached"
      @open="emit('open', $event)"
      @toggle-select="emit('toggle-select', $event)"
      @toggle-pin="emit('toggle-pin', $event)"
      @rename="emit('rename', $event)"
      @duplicate="emit('duplicate', $event)"
      @delete="emit('delete', $event)"
    />
    <slot name="append" />
  </div>

  <div v-else class="flex flex-col gap-1.5">
    <DiagramTile
      v-for="diagram in diagrams"
      :key="diagram.name"
      :diagram="diagram"
      view="list"
      :selected="selected.has(diagram.name)"
      :selection-active="selected.size > 0"
      :pin-limit-reached="pinLimitReached"
      @open="emit('open', $event)"
      @toggle-select="emit('toggle-select', $event)"
      @toggle-pin="emit('toggle-pin', $event)"
      @rename="emit('rename', $event)"
      @duplicate="emit('duplicate', $event)"
      @delete="emit('delete', $event)"
    />
    <slot name="append" />
  </div>
</template>
