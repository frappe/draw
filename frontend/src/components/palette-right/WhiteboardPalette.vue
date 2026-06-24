<script setup>
// Whiteboard right-palette (spec diagram-types C7/W6). Context-sensitive: the
// active tool (and any selected object) decides which controls show —
// pen/highlighter → color + thickness; sticky → color; otherwise base styling.
// Always present: the board-wide sketch-style toggle, theme presets, a hyperlink
// editor for the selected object, and the navigator (minimap). RightPalette
// renders this when strategy.paletteMode==='whiteboard'.
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { PEN_COLORS, PEN_WIDTHS, STICKY_COLORS } from '@/diagram/whiteboardColors.js'
import PaletteSection from './PaletteSection.vue'
import ThemePresetsSection from './ThemePresetsSection.vue'
import WhiteboardMinimap from '@/components/canvas/WhiteboardMinimap.vue'

const store = useDiagramStore()
const editorUi = useEditorUi()
const ui = useWhiteboardUi()

const tool = computed(() => editorUi.state.tool)
const isPen = computed(() => tool.value === 'pen' || tool.value === 'highlighter')
const isSticky = computed(() => tool.value === 'sticky')
const sketchOn = computed(() => Boolean(store.state.whiteboard?.sketchStyle))

function toggleSketch() {
  store.updateWhiteboardModel('Sketch style', (model) => (model.sketchStyle = !model.sketchStyle))
}

// Hyperlink editor for the selected sticky (spec W6). URL vs diagram inferred by
// whether the target looks like an http(s) address.
const link = ref('')
const selectedSticky = computed(() =>
  ui.state.selected?.kind === 'sticky'
    ? store.state.whiteboard.stickyNotes.find((note) => note.id === ui.state.selected.id)
    : null,
)
watch(selectedSticky, (note) => (link.value = note?.hyperlink?.target || ''), { immediate: true })

function applyLink() {
  if (!selectedSticky.value) return
  const target = link.value.trim()
  const hyperlink = target ? { type: /^https?:\/\//i.test(target) ? 'url' : 'diagram', target } : null
  store.updateStickyNote(selectedSticky.value.id, { hyperlink })
}
</script>

<template>
  <div>
    <!-- Pen / highlighter: color + thickness (spec C7). -->
    <PaletteSection v-if="isPen" :label="tool === 'highlighter' ? 'Highlighter' : 'Pen'">
      <div class="mb-2 grid grid-cols-9 gap-1.5">
        <button
          v-for="color in PEN_COLORS"
          :key="color"
          class="h-5 w-5 rounded-full border"
          :class="ui.state.penColor === color ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
          :style="{ background: color }"
          @click="ui.state.penColor = color"
        />
      </div>
      <div v-if="tool === 'pen'" class="flex gap-2">
        <button
          v-for="width in PEN_WIDTHS"
          :key="width"
          class="flex h-7 flex-1 items-center justify-center rounded-md"
          :class="ui.state.penWidth === width ? 'bg-surface-gray-3' : 'bg-surface-gray-1 hover:bg-surface-gray-2'"
          @click="ui.state.penWidth = width"
        >
          <span class="rounded-full bg-ink-gray-9" :style="{ width: width + 'px', height: width + 'px' }" />
        </button>
      </div>
    </PaletteSection>

    <!-- Sticky: color (spec C7). -->
    <PaletteSection v-else-if="isSticky" label="Sticky color">
      <div class="grid grid-cols-9 gap-1.5">
        <button
          v-for="color in STICKY_COLORS"
          :key="color"
          class="h-5 w-5 rounded-sm border"
          :class="ui.state.stickyColor === color ? 'border-[1.5px] border-ink-gray-9' : 'border-outline-gray-2'"
          :style="{ background: color }"
          @click="ui.state.stickyColor = color"
        />
      </div>
    </PaletteSection>

    <!-- Default: a short hint about base styling (spec C7). -->
    <PaletteSection v-else label="Tools">
      <p class="text-[12px] leading-relaxed text-ink-gray-6">
        Double-click to type, or pick a tool below to draw, highlight, or drop a sticky note.
      </p>
    </PaletteSection>

    <!-- Board-wide hand-drawn / sketch toggle (spec C4). -->
    <PaletteSection label="Style">
      <Button :variant="sketchOn ? 'solid' : 'subtle'" class="w-full" @click="toggleSketch">
        {{ sketchOn ? 'Sketch style: on' : 'Sketch style: off' }}
      </Button>
    </PaletteSection>

    <!-- Hyperlink for the selected sticky (spec W6). -->
    <PaletteSection v-if="selectedSticky" label="Link">
      <input
        v-model="link"
        type="text"
        placeholder="URL or diagram id"
        class="w-full rounded-md border border-outline-gray-2 px-2 py-1 text-[12px] outline-none focus:border-outline-gray-3"
        @keydown.enter="applyLink"
        @blur="applyLink"
      />
    </PaletteSection>

    <ThemePresetsSection />

    <WhiteboardMinimap />
  </div>
</template>
