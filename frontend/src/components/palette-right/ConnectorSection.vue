<script setup>
// Right-palette controls for a selected connector/line (spec §5.3): per-end
// arrowhead style (Google-Slides style), line color, width and dash. Writes
// through store.updateConnector, which shallow-merges nested style/arrowheads.
import { computed } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import PaletteSection from './PaletteSection.vue'
import ColorPicker from './ColorPicker.vue'

const props = defineProps({
  connector: { type: Object, required: true },
})
const store = useDiagramStore()

// Endpoint styles offered for each end (matches ConnectorMarker shapes).
const ENDPOINTS = [
  { value: 'none', icon: 'minus', label: 'None' },
  { value: 'arrow', icon: 'arrow-right', label: 'Arrow' },
  { value: 'open-arrow', icon: 'chevron-right', label: 'Open' },
  { value: 'circle', icon: 'circle', label: 'Circle' },
  { value: 'square', icon: 'square', label: 'Square' },
  { value: 'diamond', icon: 'square', label: 'Diamond', rotate: true },
]
const WIDTHS = [1.5, 2.2, 3, 4]

function normEnd(value) {
  if (value === true) return 'arrow'
  if (value === false || value == null) return 'none'
  return value
}
const startType = computed(() => normEnd(props.connector.arrowheads?.start))
const endType = computed(() => normEnd(props.connector.arrowheads?.end))
const style = computed(() => props.connector.style || {})

function setEnd(which, value) {
  store.updateConnector(props.connector.id, { arrowheads: { [which]: value } })
}
function setStyle(patch) {
  store.updateConnector(props.connector.id, { style: patch })
}

const cellActive = 'bg-surface-gray-3 text-ink-gray-9'
const cellIdle = 'text-ink-gray-7 hover:bg-surface-gray-2'
</script>

<template>
  <PaletteSection label="Start">
    <div class="flex gap-1">
      <button
        v-for="e in ENDPOINTS"
        :key="`s-${e.value}`"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="startType === e.value ? cellActive : cellIdle"
        :title="e.label"
        :aria-label="`Start: ${e.label}`"
        :aria-pressed="startType === e.value"
        @click="setEnd('start', e.value)"
      >
        <LucideIcon :name="e.icon" class="h-4 w-4" :class="e.rotate ? 'rotate-45' : ''" />
      </button>
    </div>
  </PaletteSection>

  <PaletteSection label="End">
    <div class="flex gap-1">
      <button
        v-for="e in ENDPOINTS"
        :key="`e-${e.value}`"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="endType === e.value ? cellActive : cellIdle"
        :title="e.label"
        :aria-label="`End: ${e.label}`"
        :aria-pressed="endType === e.value"
        @click="setEnd('end', e.value)"
      >
        <LucideIcon :name="e.icon" class="h-4 w-4" :class="e.rotate ? 'rotate-45' : ''" />
      </button>
    </div>
  </PaletteSection>

  <PaletteSection label="Line">
    <ColorPicker :model-value="style.color || '#7C7C7C'" label="Color" @update:model-value="setStyle({ color: $event })" />
    <div class="mb-2 mt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Width</div>
    <div class="mb-2 flex gap-1">
      <button
        v-for="w in WIDTHS"
        :key="w"
        class="flex h-7 flex-1 items-center justify-center rounded-md"
        :class="(style.width || 2.2) === w ? cellActive : cellIdle"
        :aria-label="`Line width ${w}`"
        @click="setStyle({ width: w })"
      >
        <span class="w-5 rounded-full bg-ink-gray-9" :style="{ height: Math.max(1, w - 0.5) + 'px' }" />
      </button>
    </div>
    <div class="flex gap-1">
      <button
        v-for="d in ['solid', 'dashed', 'dotted']"
        :key="d"
        class="h-7 flex-1 rounded-md text-[12px] capitalize"
        :class="(style.dash || 'solid') === d ? cellActive : cellIdle"
        @click="setStyle({ dash: d })"
      >
        {{ d }}
      </button>
    </div>

    <!-- Elbow routes can bend with rounded or sharp corners (spec 3.6). -->
    <template v-if="connector.type === 'elbow'">
      <div class="mb-2 mt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-5">Corners</div>
      <div class="flex gap-1">
        <button
          v-for="c in ['rounded', 'sharp']"
          :key="c"
          class="h-7 flex-1 rounded-md text-[12px] capitalize"
          :class="(style.corner || 'rounded') === c ? cellActive : cellIdle"
          @click="setStyle({ corner: c })"
        >
          {{ c }}
        </button>
      </div>
    </template>
  </PaletteSection>
</template>
