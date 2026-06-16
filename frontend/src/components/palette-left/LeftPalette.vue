<script setup>
// Left creation palette (56px, spec §4.2 / README 4b). Top-to-bottom by expected
// popularity: search, basic shapes, connectors, icons, emoji — divided into
// groups by 24px hairlines. Clicking a shape/connector arms draw mode via
// editorUi.setDrawShape; dragging a tile starts drag-and-drop onto the canvas
// (both handled by useShapeCreation). The active tool is highlighted. The search
// input filters every group by name.
import { ref, computed } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { startPaletteDrag } from '@/composables/useShapeCreation.js'
import PaletteSearch from './PaletteSearch.vue'
import ShapeToolButton from './ShapeToolButton.vue'

const editorUi = useEditorUi()
const query = ref('')

// Basic shapes and connectors map 1:1 to store/editorUi draw types (spec §5).
const shapeGroup = [
  { type: 'rectangle', icon: 'square', label: 'Rectangle' },
  { type: 'ellipse', icon: 'circle', label: 'Ellipse' },
  { type: 'triangle', icon: 'triangle', label: 'Triangle' },
  { type: 'diamond', icon: 'octagon', label: 'Diamond' },
  { type: 'text', icon: 'type', label: 'Text box' },
]

const connectorGroup = [
  { type: 'straight', icon: 'arrow-right', label: 'Straight arrow' },
  { type: 'elbow', icon: 'corner-down-right', label: 'Elbow connector' },
  { type: 'curved', icon: 'git-commit', label: 'Curved connector' },
]

// Icons + emoji are searchable group entries (Espresso icons / emoji library is
// integrated later; these are the curated, named entry points — spec §4.2).
const libraryGroup = [
  { type: 'icons', icon: 'image', label: 'Icons' },
  { type: 'emoji', icon: 'smile', label: 'Emoji' },
]

function matches(item) {
  const term = query.value.trim().toLowerCase()
  return !term || item.label.toLowerCase().includes(term)
}

const shapes = computed(() => shapeGroup.filter(matches))
const connectors = computed(() => connectorGroup.filter(matches))
const library = computed(() => libraryGroup.filter(matches))

function isActive(type) {
  return editorUi.state.tool === 'draw' && editorUi.state.drawShapeType === type
}

function arm(type) {
  editorUi.setDrawShape(type)
}

function onDragStart(event, type) {
  startPaletteDrag(event, type, editorUi)
}
</script>

<template>
  <nav
    class="flex w-14 flex-none flex-col items-center gap-[3px] overflow-y-auto border-r border-outline-gray-1 bg-surface-white py-2"
    aria-label="Creation palette"
  >
    <PaletteSearch v-model:query="query" />
    <div class="my-1 h-px w-6 bg-outline-gray-1" />

    <template v-if="shapes.length">
      <ShapeToolButton
        v-for="shape in shapes"
        :key="shape.type"
        :icon="shape.icon"
        :label="shape.label"
        :active="isActive(shape.type)"
        draggable
        @select="arm(shape.type)"
        @dragstart="onDragStart($event, shape.type)"
      />
      <div class="my-1 h-px w-6 bg-outline-gray-1" />
    </template>

    <template v-if="connectors.length">
      <ShapeToolButton
        v-for="connector in connectors"
        :key="connector.type"
        :icon="connector.icon"
        :label="connector.label"
        :active="isActive(connector.type)"
        draggable
        @select="arm(connector.type)"
        @dragstart="onDragStart($event, connector.type)"
      />
      <div class="my-1 h-px w-6 bg-outline-gray-1" />
    </template>

    <ShapeToolButton
      v-for="item in library"
      :key="item.type"
      :icon="item.icon"
      :label="item.label"
    />
  </nav>
</template>
