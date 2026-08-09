<script setup>
// Export menu (#104): one flat list, no section headers. PNG carries an inline
// 1–4× scale selector; JPEG / SVG / PDF are plain rows; Print sits below a
// divider. Export is always the whole diagram — the old "Selection only" and
// "Output" (copy/outline) groups were dropped.
//
// PNG transparency is not a per-export choice (#226): it follows the canvas
// background, so "No color" exports transparent and a coloured canvas keeps
// its colour.
import { Button, Popover } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useExport } from '@/composables/useExport.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()
const exporter = useExport(store)

const PNG_SCALES = [1, 2, 3, 4]

function exportPng(scale, close) {
  exporter.exportPng(scale)
  close?.()
}

const FORMATS = [
  { label: 'JPEG', icon: 'image', run: () => exporter.exportJpeg() },
  { label: 'SVG', icon: 'code', run: () => exporter.exportSvg() },
  { label: 'PDF', icon: 'file-text', run: () => exporter.exportPdf() },
]
function runFormat(format, close) {
  format.run()
  close?.()
}
function print(close) {
  exporter.printDiagram()
  close?.()
}

const rowClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-gray-8 hover:bg-surface-gray-2'
</script>

<template>
  <Popover>
    <template #trigger>
      <Button variant="outline">
        <template #prefix><LucideIcon name="download" class="h-4 w-4" /></template>
        Export
      </Button>
    </template>
    <template #default="{ toggle }">
      <div class="w-56 p-1.5">
        <!-- PNG: scale selector -->
        <div class="rounded-md px-2 py-1.5">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-sm text-ink-gray-8">
              <LucideIcon name="image" class="h-4 w-4 text-ink-gray-6" />
              PNG
            </span>
            <div class="flex gap-0.5">
              <button
                v-for="s in PNG_SCALES"
                :key="s"
                class="rounded px-1.5 py-0.5 text-xs text-ink-gray-7 hover:bg-surface-gray-3"
                @click="exportPng(s, toggle)"
              >
                {{ s }}×
              </button>
            </div>
          </div>
        </div>

        <button v-for="f in FORMATS" :key="f.label" :class="rowClass" @click="runFormat(f, toggle)">
          <LucideIcon :name="f.icon" class="h-4 w-4 text-ink-gray-6" />
          {{ f.label }}
        </button>

        <div class="my-1 h-px bg-surface-gray-2" />

        <button :class="rowClass" @click="print(toggle)">
          <LucideIcon name="printer" class="h-4 w-4 text-ink-gray-6" />
          Print
        </button>
      </div>
    </template>
  </Popover>
</template>
