<script setup>
// Read-only viewer (spec §9): canvas only, no palettes, no export, with a small
// footer. Stub renders the canvas from the loaded public document. The feature
// agent adds the access-denied page and guest fetch.
import { computed } from 'vue'
import DiagramCanvas from '@/components/canvas/DiagramCanvas.vue'
import { createDiagramStore, provideDiagramStore } from '@/stores/useDiagramStore.js'
import { createEditorUi, provideEditorUi } from '@/stores/useEditorUi.js'
import { loadDiagram } from '@/data/diagrams.js'
import { parseDiagramDocument } from '@/diagram/schema.js'

const props = defineProps({
  name: { type: String, required: true },
})

const diagram = loadDiagram(props.name)
const store = createDiagramStore(parseDiagramDocument(diagram.doc?.document))
provideDiagramStore(store)
provideEditorUi(createEditorUi())

const ready = computed(() => Boolean(diagram.doc))
</script>

<template>
  <div class="flex h-screen flex-col bg-surface-page">
    <main class="min-h-0 flex-1">
      <DiagramCanvas v-if="ready" />
    </main>
    <footer class="flex-none py-1.5 text-center text-[11px] text-ink-gray-5">
      Made with Frappe Draw
    </footer>
  </div>
</template>
