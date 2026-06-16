<script setup>
// Export dropdown: PNG (1x/2x), JPEG, SVG, PDF, and Print (spec §10, §4.4).
// Captures canvas bounds (not the viewport) and excludes the grid via useExport,
// which serializes the diagram document to a standalone SVG.
import { Button, Dropdown, FeatherIcon } from 'frappe-ui'
import { useExport } from '@/composables/useExport.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const exporter = useExport(useDiagramStore())

const options = [
  {
    group: 'Export',
    items: [
      { label: 'PNG', icon: 'image', onClick: exporter.exportPng },
      { label: 'PNG (2x)', icon: 'image', onClick: exporter.exportPng2x },
      { label: 'JPEG', icon: 'image', onClick: exporter.exportJpeg },
      { label: 'SVG', icon: 'code', onClick: exporter.exportSvg },
      { label: 'PDF', icon: 'file-text', onClick: exporter.exportPdf },
    ],
  },
  {
    group: 'Output',
    items: [{ label: 'Print…', icon: 'printer', onClick: exporter.printDiagram }],
  },
]
</script>

<template>
  <Dropdown :options="options">
    <Button variant="outline">
      <template #prefix><FeatherIcon name="download" class="h-4 w-4" /></template>
      Export
    </Button>
  </Dropdown>
</template>
