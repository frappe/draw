<script setup>
// Editor page — owns the diagram store. Loads the Draw Diagram doc, parses its
// document, creates + provides the store and editor UI, then composes the
// toolbar, palettes, canvas, and floating palette (CONVENTIONS integration).
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadDiagram } from '@/data/diagrams.js'
import { folders } from '@/data/folders.js'
import { parseDiagramDocument, isUnifiedDocument } from '@/diagram/schema.js'
import { createDiagramStore, provideDiagramStore } from '@/stores/useDiagramStore.js'
import { createEditorUi, provideEditorUi } from '@/stores/useEditorUi.js'
import { provideModeStrategy, getModeStrategy } from '@/stores/useModeStrategy.js'
import { resetMindmapUi } from '@/stores/mindmapUi.js'
import { provideModeInteraction } from '@/composables/useModeInteraction.js'
import { useKeyboard, keyboardOwner } from '@/composables/useKeyboard.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useClipboard } from '@/composables/useClipboard.js'
import { useAutosave } from '@/composables/useAutosave.js'
import { useThumbnail } from '@/composables/useThumbnail.js'
import { useCollaboration } from '@/composables/useCollaboration.js'
import { useAppSettings } from '@/composables/useAppSettings.js'
import TopToolbar from '@/components/toolbar/TopToolbar.vue'
import DiagramCanvas from '@/components/canvas/DiagramCanvas.vue'
import Minimap from '@/components/canvas/Minimap.vue'
import WhiteboardMinimap from '@/components/canvas/WhiteboardMinimap.vue'
import MindMapOverlay from '@/components/canvas/MindMapOverlay.vue'
import FlowchartOverlay from '@/components/canvas/FlowchartOverlay.vue'
import BlockSelectionEditor from '@/components/floating/BlockSelectionEditor.vue'
import FlowchartSelectionEditor from '@/components/floating/FlowchartSelectionEditor.vue'
import WhiteboardSelectionEditor from '@/components/floating/WhiteboardSelectionEditor.vue'
import CollaboratorCursors from '@/components/canvas/CollaboratorCursors.vue'
import BottomPalette from '@/components/floating/BottomPalette.vue'
import ViewportControls from '@/components/floating/ViewportControls.vue'
import ShortcutsDialog from '@/components/ShortcutsDialog.vue'

const props = defineProps({
  name: { type: String, required: true },
})

const diagram = loadDiagram(props.name)
const store = createDiagramStore(parseDiagramDocument(diagram.doc?.document))
const editorUi = createEditorUi()
const whiteboardUi = useWhiteboardUi()
// editorUi is created per editor, but mindmapUi is a module singleton whose fields
// all hold node ids — and node ids are per-document counters, so they repeat across
// maps. Clear it as each document loads, or leftovers (a branch focus, a half-armed
// cross-link) silently re-attach to whichever node shares that id here.
resetMindmapUi()
provideDiagramStore(store)
provideEditorUi(editorUi)

// Active mode module for this diagram's type (spec diagram-types §0/G1). The
// unified canvas keeps its own strategy throughout: a mind map / flowchart on it
// is an ordinary canvas object edited in place, not a container the editor
// switches into (#45).
const modeStrategy = computed(() => getModeStrategy(store.state.diagramType))
provideModeStrategy(modeStrategy)

// Which type's editing CHROME to mount — the node toolbars and selection editors.
//
// This is not always the strategy's type. A unified document resolves to the BLOCK
// strategy, so gating the chrome on `modeStrategy.type` alone left a mind map or
// flowchart edited in place on the unified canvas with no toolbar at all: focus mode
// used to override the whole strategy, and removing it (#45) took the chrome with it.
//
// On the unified canvas the chrome therefore follows whichever model holds the
// SELECTION — the same rule the keyboard uses, so the toolbar you see and the keys
// that work can never disagree. Mounting the overlays unconditionally instead would
// drop their single-type empty-state prompts onto the unified canvas.
//
// The whiteboard needs the same treatment, and for a sharper reason: its selection
// editor carries the only Delete button a line, table or stroke has. Gated on the
// strategy it never mounted on a unified document, so those objects could be placed
// there and never removed by mouse either.
const chromeType = computed(() => {
  if (!isUnifiedDocument(store.state)) return modeStrategy.value.type
  if (whiteboardUi.state.selection.length) return 'whiteboard'
  return keyboardOwner(store) || 'block'
})

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
// Real-time co-editing (Yjs + y-webrtc) + live cursors, keyed by the diagram name.
const collab = useCollaboration(store, editorUi, props.name)
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

// The doc may arrive after mount; load it into the store once it lands. Reset the
// mind-map chrome with it — this fires for a late-arriving document and for any
// in-place document swap, neither of which re-runs setup.
watch(
  () => diagram.doc?.document,
  (raw) => {
    if (raw) {
      resetMindmapUi()
      store.loadDocument(parseDiagramDocument(raw))
    }
  },
)

// Every type now opens on a plain white canvas (S6); guides are off by default
// (editorUi.state.gridVisible) and turned on from the bottom-palette control.

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
  // Consume the ?new flag (title auto-select) so a later refresh of this URL
  // won't re-open the title editor.
  if (route.query.new) {
    const query = { ...route.query }
    delete query.new
    router.replace({ name: 'Editor', params: { name: props.name }, query })
  }
})
</script>

<template>
  <div
    class="flex h-screen flex-col bg-surface-base text-ink-gray-9"
    :data-theme="dark ? 'dark' : null"
  >
    <TopToolbar
      :title="diagram.doc?.title || 'Untitled diagram'"
      :save-status="autosave.status.value"
      :dark="dark"
      :folder="folderName"
      :folder-id="diagram.doc?.folder || ''"
      @update:title="rename"
      @toggle-dark="toggleDarkMode"
    />

    <div class="flex min-h-0 flex-1">
      <main class="relative min-h-0 min-w-0 flex-1">
        <DiagramCanvas />
        <Minimap />
        <WhiteboardMinimap v-if="modeStrategy.type === 'whiteboard'" />
        <MindMapOverlay v-if="chromeType === 'mindmap'" />
        <FlowchartOverlay v-if="chromeType === 'flowchart'" />
        <!-- Also on the whiteboard: text/image are block shapes, so their format
             menu (font, size, colour…) is the block editor, shown when one is
             selected (S13/S14/U1). WhiteboardSelectionEditor handles board objects. -->
        <BlockSelectionEditor v-if="chromeType === 'block' || chromeType === 'whiteboard'" />
        <FlowchartSelectionEditor v-if="chromeType === 'flowchart'" />
        <WhiteboardSelectionEditor v-if="chromeType === 'whiteboard'" />
        <CollaboratorCursors :collaborators="collab.collaborators.value" :set-cursor="collab.setCursor" />
        <ViewportControls />
        <BottomPalette />
      </main>
    </div>

    <ShortcutsDialog />
  </div>
</template>
