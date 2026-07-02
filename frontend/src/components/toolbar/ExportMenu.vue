<script setup>
// Export dropdown: PNG (1x/2x), JPEG, SVG, PDF, and Print (spec §10, §4.4).
// Captures canvas bounds (not the viewport) and excludes the grid via useExport,
// which serializes the diagram document to a standalone SVG.
import { Button, Dropdown, toast } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useRoute } from 'vue-router'
import { useExport } from '@/composables/useExport.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { loadDiagram } from '@/data/diagrams.js'
import { saveTemplate } from '@/composables/useTemplates.js'

const store = useDiagramStore()
const exporter = useExport(store)
const route = useRoute()
const diagram = loadDiagram(route.params.name)

// Persist the current diagram as a reusable template for its type (spec 10.3).
function saveAsTemplate() {
  const name = `${diagram.doc?.title || 'Untitled'} template`
  saveTemplate({ name, type: store.state.diagramType, document: store.getDocument() })
  toast.success('Saved as a template — find it under New diagram')
}

const options = [
  {
    group: 'Whole diagram',
    items: [
      { label: 'PNG · 1×', icon: 'image', onClick: () => exporter.exportPng(1) },
      { label: 'PNG · 2×', icon: 'image', onClick: () => exporter.exportPng(2) },
      { label: 'PNG · 3×', icon: 'image', onClick: () => exporter.exportPng(3) },
      { label: 'PNG · transparent', icon: 'image', onClick: exporter.exportPngTransparent },
      { label: 'JPEG', icon: 'image', onClick: exporter.exportJpeg },
      { label: 'SVG', icon: 'code', onClick: exporter.exportSvg },
      { label: 'PDF', icon: 'file-text', onClick: exporter.exportPdf },
    ],
  },
  {
    group: 'Selection only',
    items: [
      { label: 'PNG · 1×', icon: 'crop', onClick: () => exporter.exportSelectionPng(1) },
      { label: 'PNG · 2×', icon: 'crop', onClick: () => exporter.exportSelectionPng(2) },
      { label: 'PNG · 3×', icon: 'crop', onClick: () => exporter.exportSelectionPng(3) },
      { label: 'SVG', icon: 'crop', onClick: exporter.exportSelectionSvg },
    ],
  },
  {
    group: 'Output',
    items: [
      { label: 'Copy as image', icon: 'copy', onClick: exporter.copyImage },
      { label: 'Outline (Markdown)', icon: 'list', onClick: exporter.exportOutline },
      { label: 'Print…', icon: 'printer', onClick: exporter.printDiagram },
      { label: 'Save as template', icon: 'bookmark', onClick: saveAsTemplate },
    ],
  },
]
</script>

<template>
  <Dropdown :options="options">
    <Button variant="outline">
      <template #prefix><LucideIcon name="download" class="h-4 w-4" /></template>
      Export
    </Button>
  </Dropdown>
</template>
