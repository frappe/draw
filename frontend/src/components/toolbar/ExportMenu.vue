<script setup>
// Export menu (#104): one flat list, no section headers. PNG carries an inline
// 1–4× scale selector + a transparent-background toggle; JPEG / SVG / PDF are
// plain rows; Print sits below a divider. Export is always the whole diagram —
// the old "Selection only" and "Output" (copy/outline) groups were dropped.
import { ref } from 'vue'
import { Button, Popover } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useExport } from '@/composables/useExport.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()
const exporter = useExport(store)

const PNG_SCALES = [1, 2, 3, 4]
const transparent = ref(false)

function exportPng(scale, close) {
  exporter.exportPng(scale, transparent.value)
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
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink-gray-8 hover:bg-surface-gray-2'
</script>

<template>
  <Popover>
    <template #target="{ togglePopover }">
      <Button variant="outline" @click="togglePopover()">
        <template #prefix><LucideIcon name="download" class="h-4 w-4" /></template>
        Export
      </Button>
    </template>
    <template #body-main="{ togglePopover }">
      <div class="w-56 p-1.5">
        <!-- PNG: scale selector + transparent toggle -->
        <div class="rounded-md px-2 py-1.5">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-[13px] text-ink-gray-8">
              <LucideIcon name="image" class="h-4 w-4 text-ink-gray-6" />
              PNG
            </span>
            <div class="flex gap-0.5">
              <button
                v-for="s in PNG_SCALES"
                :key="s"
                class="rounded px-1.5 py-0.5 text-xs text-ink-gray-7 hover:bg-surface-gray-3"
                @click="exportPng(s, togglePopover)"
              >
                {{ s }}×
              </button>
            </div>
          </div>
          <label class="mt-1.5 flex cursor-pointer select-none items-center gap-1.5 text-xs text-ink-gray-5">
            <input v-model="transparent" type="checkbox" class="h-3 w-3 accent-ink-gray-8" />
            Transparent background
          </label>
        </div>

        <button v-for="f in FORMATS" :key="f.label" :class="rowClass" @click="runFormat(f, togglePopover)">
          <LucideIcon :name="f.icon" class="h-4 w-4 text-ink-gray-6" />
          {{ f.label }}
        </button>

        <div class="my-1 h-px bg-surface-gray-2" />

        <button :class="rowClass" @click="print(togglePopover)">
          <LucideIcon name="printer" class="h-4 w-4 text-ink-gray-6" />
          Print
        </button>
      </div>
    </template>
  </Popover>
</template>
