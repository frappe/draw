<script setup>
// Export dropdown: PNG/JPEG/SVG/PDF (spec §10). Stub: a Dropdown of formats
// wired to useExport actions. The feature agent fills the export logic.
import { Button, Dropdown, FeatherIcon } from 'frappe-ui'
import { useExport } from '@/composables/useExport.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const exporter = useExport(useDiagramStore())

const options = [
  { label: 'PNG', onClick: exporter.exportPng },
  { label: 'JPEG', onClick: exporter.exportJpeg },
  { label: 'SVG', onClick: exporter.exportSvg },
  { label: 'PDF', onClick: exporter.exportPdf },
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
