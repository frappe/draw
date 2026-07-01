<script setup>
// Editor page — owns the diagram store. Loads the Draw Diagram doc, parses its
// document, creates + provides the store and editor UI, then composes the
// toolbar, palettes, canvas, and floating palette (CONVENTIONS integration).
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadDiagram } from '@/data/diagrams.js'
import { folders } from '@/data/folders.js'
import { parseDiagramDocument } from '@/diagram/schema.js'
import { createDiagramStore, provideDiagramStore } from '@/stores/useDiagramStore.js'
import { createEditorUi, provideEditorUi } from '@/stores/useEditorUi.js'
import { provideModeStrategy, getModeStrategy } from '@/stores/useModeStrategy.js'
import { provideModeInteraction } from '@/composables/useModeInteraction.js'
import { useKeyboard } from '@/composables/useKeyboard.js'
import { useClipboard } from '@/composables/useClipboard.js'
import { useAutosave } from '@/composables/useAutosave.js'
import { useThumbnail } from '@/composables/useThumbnail.js'
import { useAppSettings } from '@/composables/useAppSettings.js'
import TopToolbar from '@/components/toolbar/TopToolbar.vue'
import DiagramCanvas from '@/components/canvas/DiagramCanvas.vue'
import Minimap from '@/components/canvas/Minimap.vue'
import BottomPalette from '@/components/floating/BottomPalette.vue'
import RightPalette from '@/components/palette-right/RightPalette.vue'
import ShortcutsDialog from '@/components/ShortcutsDialog.vue'
import FirstRunTour from '@/components/FirstRunTour.vue'

const props = defineProps({
  name: { type: String, required: true },
})

const diagram = loadDiagram(props.name)
const store = createDiagramStore(parseDiagramDocument(diagram.doc?.document))
const editorUi = createEditorUi()
provideDiagramStore(store)
provideEditorUi(editorUi)

// Active mode module for this diagram's type (spec diagram-types §0/G1).
const modeStrategy = computed(() => getModeStrategy(store.state.diagramType))
provideModeStrategy(modeStrategy)

// Surface-interaction delegation seam (spec diagram-types Part G1/G4). The active
// type's interaction composable registers its handler object into this ref via
// registerModeInteraction(); DiagramCanvas injects + delegates to it. Provided
// here so it lives for the editor's lifetime regardless of which type loads.
provideModeInteraction()

// Dark mode is an app-wide, persisted setting (also toggled from the home
// sidebar). The editor's moon button flips the same source so the choice is
// consistent everywhere; data-theme is already applied on <html> at boot.
const { settings: appSettings, toggleDarkMode } = useAppSettings()
const dark = computed(() => appSettings.darkMode)
const autosave = useAutosave(store, diagram)
const thumbnail = useThumbnail(store, diagram)
useKeyboard(store, editorUi)
useClipboard(store)

// Regenerate the thumbnail after each successful save; generate() self-throttles
// to at most once / 30s (spec §11.2/§11.4).
watch(
  () => autosave.status.value,
  (status) => {
    if (status === 'saved') thumbnail.generate()
  },
)

// The doc may arrive after mount; load it into the store once it lands.
watch(
  () => diagram.doc?.document,
  (raw) => {
    if (raw) store.loadDocument(parseDiagramDocument(raw))
  },
)

// Only block diagrams open with dotted guides; every other type starts on a
// plain white canvas (guides can be turned on from the bottom palette). The type
// is only known once the document loads, so default it then.
watch(
  () => store.state.diagramType,
  (type) => {
    if (type && type !== 'block') editorUi.state.gridVisible = false
  },
  { immediate: true },
)

function rename(title) {
  diagram.setValue.submit({ title })
}

// Folder name for the breadcrumb (the diagram's folder is stored by id). Fetched
// lazily; empty when the diagram sits at the root.
const folderName = computed(() => {
  const id = diagram.doc?.folder
  if (!id) return ''
  return (folders.data || []).find((f) => f.name === id)?.folder_name || ''
})

// Consume the ?new=1 flag once TitleEditor (a child, mounted first) has read it,
// so a later refresh of this URL won't re-open the title editor.
const route = useRoute()
const router = useRouter()
onMounted(() => {
  if (!folders.data) folders.fetch()
  if (route.query.new) router.replace({ name: 'Editor', params: { name: props.name } })
})
</script>

<template>
  <div
    class="flex h-screen flex-col bg-surface-white text-ink-gray-9"
    :data-theme="dark ? 'dark' : null"
  >
    <TopToolbar
      :title="diagram.doc?.title || 'Untitled diagram'"
      :save-status="autosave.status.value"
      :dark="dark"
      :folder="folderName"
      @update:title="rename"
      @toggle-dark="toggleDarkMode"
    />

    <div class="flex min-h-0 flex-1">
      <main class="relative min-h-0 min-w-0 flex-1">
        <DiagramCanvas />
        <Minimap />
        <BottomPalette />
      </main>
      <RightPalette v-if="modeStrategy.showsRightPalette !== false" />
    </div>

    <ShortcutsDialog />
    <FirstRunTour />
  </div>
</template>
