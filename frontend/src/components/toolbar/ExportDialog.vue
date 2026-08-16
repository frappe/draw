<script setup>
// Export (#225), Figma-style: choose the format and scale, see what you will get,
// then press Export. The old menu fired the download the moment you touched a
// format, so there was no moment to change your mind and no way to tell a 1x PNG
// from a 4x one before it landed in Downloads.
//
// The option set lives in exportFormats.js so it can be unit-tested without
// mounting this dialog. Print keeps its place here as a secondary action — it is
// not a file format, but it is the same "produce this diagram elsewhere" job.
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Dialog, Select, TabButtons } from 'frappe-ui'
import { useExport } from '@/composables/useExport.js'
import { documentToSvg } from '@/composables/useThumbnail.js'
import { loadDiagram } from '@/data/diagrams.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  DEFAULT_FORMAT,
  DEFAULT_SCALE,
  findFormat,
  isScalable,
  outputSizeLabel,
} from './exportFormats.js'

const store = useDiagramStore()
// useExport has always accepted a title accessor for the file name, and nothing
// ever passed one — so every export landed in Downloads as "diagram.png". Loaded
// from the route the way ShareMenu does, keeping the toolbar itself prop-light.
const route = useRoute()
const diagram = loadDiagram(route.params.name)
const exporter = useExport(store, () => diagram.doc?.title)

const open = ref(false)
const format = ref(DEFAULT_FORMAT)
const scale = ref(DEFAULT_SCALE)
const busy = ref(false)

const current = computed(() => findFormat(format.value))
const showsScale = computed(() => isScalable(format.value))
const sizeLabel = computed(() => outputSizeLabel(store.state.canvas, format.value, scale.value))

// `iconLeft`, not `icon`: TabButtons renders an `icon` option as icon-ONLY, with
// the label demoted to aria-label. Four unlabelled file glyphs are unreadable —
// the format name is the identity here, and the glyph only decorates it.
const formatOptions = EXPORT_FORMATS.map((f) => ({ value: f.value, label: f.label, iconLeft: f.icon }))
const scaleOptions = EXPORT_SCALES.map((s) => ({ value: s, label: `${s}×` }))
// The scale a vector format would use if it used one. It stays selected while the
// control is disabled, so switching PNG -> SVG -> PNG comes back to the same scale
// rather than resetting it.

// Rendered from the same builder as the export itself, so the preview cannot drift
// from the file. Only while the dialog is open — it is not cheap on a big diagram.
const previewSvg = computed(() => (open.value ? documentToSvg(store.getDocument()) : null))

const RUNNERS = {
  png: () => exporter.exportPng(scale.value),
  jpeg: () => exporter.exportJpeg(scale.value),
  svg: () => exporter.exportSvg(),
  pdf: () => exporter.exportPdf(),
}

async function runExport() {
  busy.value = true
  try {
    await RUNNERS[format.value]()
    open.value = false
  } finally {
    busy.value = false
  }
}

async function print() {
  await exporter.printDiagram()
  open.value = false
}
</script>

<template>
  <Button variant="ghost" icon="lucide-download" label="Export" tooltip="Export" @click="open = true" />

  <Dialog v-model:open="open" title="Export">
    <template #default>
      <div class="space-y-4">
        <!-- What you are about to get. Fixed light background: the canvas is light
             even in dark mode, so the preview must be too. -->
        <div
          class="flex h-40 items-center justify-center overflow-hidden rounded-md border border-outline-gray-2 p-2"
          style="background-color: #ffffff"
        >
          <div
            v-if="previewSvg"
            class="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            v-html="previewSvg"
          />
          <span v-else class="text-sm italic text-ink-gray-4">Nothing to export yet</span>
        </div>

        <!-- The dialog keeps ONE height whatever the format is (#455). It is
             vertically centred, so anything that leaves the layout moves every
             remaining control up the screen, under the pointer that just clicked. -->
        <div>
          <p class="mb-1.5 text-sm font-medium text-ink-gray-7">Format</p>
          <div class="flex items-center gap-2">
            <TabButtons v-model="format" class="flex-1" size="sm" :options="formatOptions" />
            <!-- The scale rides on the Format row rather than in a Size block of its
                 own, and is DISABLED for a vector format rather than hidden — the
                 hidden block is what took ~44px out of the dialog. A fixed width
                 too: the Select sizes its trigger to the current value, so 1x and
                 4x would nudge the formats sideways. -->
            <Select
              class="w-16 shrink-0"
              size="sm"
              :model-value="scale"
              :options="scaleOptions"
              :disabled="!showsScale"
              @update:model-value="scale = Number($event)"
            />
          </div>
          <!-- Hint and size share one row, and it reserves two lines. JPEG's hint
               wraps to two at this width while PNG's and SVG's do not, so an
               unreserved hint is a second height variable behind the same bug. -->
          <div class="mt-1.5 flex min-h-8 items-start justify-between gap-3 text-xs text-ink-gray-5">
            <p>{{ current.hint }}</p>
            <p class="shrink-0 tabular-nums">{{ sizeLabel }}</p>
          </div>
        </div>
      </div>
    </template>

    <template #actions>
      <div class="flex justify-end gap-2">
        <Button variant="subtle" @click="print">
          <template #prefix><span class="lucide-printer h-4 w-4" aria-hidden="true" /></template>
          Print
        </Button>
        <Button variant="solid" :loading="busy" @click="runExport">
          Export {{ current.label }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>
