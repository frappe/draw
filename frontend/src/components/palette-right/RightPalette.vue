<script setup>
// Right modification palette (268px, the GRID layout — README 4d). Header shows
// the selected-shape name + count (+ "Painter on" pill), then the 9 sections.
// Multi-select intersection logic is layered in by feature agents per section.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import ArrangeSection from './ArrangeSection.vue'
import AlignSection from './AlignSection.vue'
import DistributeSizeSection from './DistributeSizeSection.vue'
import TransformSection from './TransformSection.vue'
import FillBorderSection from './FillBorderSection.vue'
import TextSection from './TextSection.vue'
import TransparencySection from './TransparencySection.vue'
import CanvasSection from './CanvasSection.vue'
import ConnectorSection from './ConnectorSection.vue'
import MindMapPalette from './MindMapPalette.vue'
import FlowchartPalette from './FlowchartPalette.vue'

const store = useDiagramStore()
const editorUi = useEditorUi()
const modeStrategy = useModeStrategy()

// Section composition is mode-aware (spec diagram-types A9/B8/C7): block renders
// the shared modification sections; every other type renders a single mode
// palette component chosen by the strategy's paletteMode.
// Whiteboard has no right panel (all controls live in the bottom palette), so it
// is intentionally absent here.
const MODE_PALETTES = {
  mindmap: MindMapPalette,
  flowchart: FlowchartPalette,
}
const isBlock = computed(() => modeStrategy.value.paletteMode === 'block')
const modePalette = computed(() => MODE_PALETTES[modeStrategy.value.paletteMode] || null)

const count = computed(() => store.state.selection.length)

// A single selected connector gets its own section (endpoints, color, width,
// dash) instead of the shape-editing sections, which don't apply to a line.
const selectedConnector = computed(() => {
  if (store.state.selection.length !== 1) return null
  return store.connectorById(store.state.selection[0]) || null
})

// Header title: the single shape's type, or a count, or "Canvas" when empty.
const headerTitle = computed(() => {
  if (count.value === 0) return 'Canvas'
  if (count.value === 1) {
    const shape = store.shapeById(store.state.selection[0])
    return shape ? capitalize(shape.type) : 'Connector'
  }
  return `${count.value} selected`
})

const headerMeta = computed(() => (count.value ? `${count.value} selected` : 'Nothing selected'))

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
</script>

<template>
  <aside
    aria-label="Properties"
    class="flex w-[268px] flex-none flex-col overflow-y-auto border-l border-outline-gray-1 bg-surface-white"
  >
    <header class="flex items-center gap-2 border-b border-outline-gray-1 px-3.5 py-2.5">
      <div>
        <div class="text-sm font-semibold text-ink-gray-9">{{ headerTitle }}</div>
        <div class="text-[11px] text-ink-gray-5">{{ headerMeta }}</div>
      </div>
      <span
        v-if="editorUi.state.formatPainter.active"
        class="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
      >
        Painter on
      </span>
    </header>

    <!-- A selected line/connector: its own endpoint + line controls. -->
    <template v-if="isBlock && selectedConnector">
      <ConnectorSection :connector="selectedConnector" />
    </template>

    <template v-else-if="isBlock">
      <!-- Object-editing sections are disabled + dimmed when nothing is
           selected; the Canvas section stays active (it needs no selection). -->
      <div :class="count === 0 ? 'pointer-events-none select-none opacity-40' : ''">
        <ArrangeSection />
        <AlignSection />
        <DistributeSizeSection />
        <TransformSection />
        <FillBorderSection />
        <TextSection />
        <TransparencySection />
      </div>
      <CanvasSection />
    </template>
    <component :is="modePalette" v-else-if="modePalette" />
  </aside>
</template>
