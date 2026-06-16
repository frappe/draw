<script setup>
// Editor page — owns the diagram store. Loads the Draw Diagram doc, parses its
// document, creates + provides the store and editor UI, then composes the
// toolbar, palettes, canvas, and floating palette (CONVENTIONS integration).
import { ref, watch } from 'vue'
import { loadDiagram } from '@/data/diagrams.js'
import { parseDiagramDocument } from '@/diagram/schema.js'
import { createDiagramStore, provideDiagramStore } from '@/stores/useDiagramStore.js'
import { createEditorUi, provideEditorUi } from '@/stores/useEditorUi.js'
import { useKeyboard } from '@/composables/useKeyboard.js'
import { useClipboard } from '@/composables/useClipboard.js'
import { useAutosave } from '@/composables/useAutosave.js'
import TopToolbar from '@/components/toolbar/TopToolbar.vue'
import LeftPalette from '@/components/palette-left/LeftPalette.vue'
import DiagramCanvas from '@/components/canvas/DiagramCanvas.vue'
import BottomPalette from '@/components/floating/BottomPalette.vue'
import RightPalette from '@/components/palette-right/RightPalette.vue'

const props = defineProps({
  name: { type: String, required: true },
})

const diagram = loadDiagram(props.name)
const store = createDiagramStore(parseDiagramDocument(diagram.doc?.document))
const editorUi = createEditorUi()
provideDiagramStore(store)
provideEditorUi(editorUi)

const dark = ref(false)
const autosave = useAutosave(store, diagram)
useKeyboard(store, editorUi)
useClipboard(store)

// The doc may arrive after mount; load it into the store once it lands.
watch(
  () => diagram.doc?.document,
  (raw) => {
    if (raw) store.loadDocument(parseDiagramDocument(raw))
  },
)

function rename(title) {
  diagram.setValue.submit({ title })
}
</script>

<template>
  <div
    class="flex h-screen flex-col bg-surface-page text-ink-gray-9"
    :data-theme="dark ? 'dark' : null"
  >
    <TopToolbar
      :title="diagram.doc?.title || 'Untitled diagram'"
      :save-status="autosave.status.value"
      :dark="dark"
      @update:title="rename"
      @toggle-dark="dark = !dark"
    />

    <div class="flex min-h-0 flex-1">
      <LeftPalette />
      <main class="relative min-h-0 flex-1">
        <DiagramCanvas />
        <BottomPalette />
      </main>
      <RightPalette />
    </div>
  </div>
</template>
