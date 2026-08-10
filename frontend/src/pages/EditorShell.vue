<script setup>
// The editor itself — owns the diagram store. Takes the already-loaded Draw
// Diagram resource from EditorPage (which is what decides whether the document
// loaded at all), parses its document, creates + provides the store and editor
// UI, then composes the toolbar, palettes, canvas, and floating palette
// (CONVENTIONS integration).
import { computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parseDiagramDocument } from '@/diagram/schema.js'
import { createDiagramStore, provideDiagramStore } from '@/stores/useDiagramStore.js'
import { createEditorUi, provideEditorUi } from '@/stores/useEditorUi.js'
import { provideModeStrategy, getModeStrategy } from '@/stores/useModeStrategy.js'
import { resetMindmapUi } from '@/stores/mindmapUi.js'
import { resetFlowchartUi } from '@/stores/flowchartUi.js'
import { provideModeInteraction } from '@/composables/useModeInteraction.js'
import { useKeyboard } from '@/composables/useKeyboard.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { createSelectionContext, provideSelectionContext } from '@/composables/useSelectionContext.js'
import { useClipboard } from '@/composables/useClipboard.js'
import { useAutosave } from '@/composables/useAutosave.js'
import { useThumbnail } from '@/composables/useThumbnail.js'
import { useCollaboration } from '@/composables/useCollaboration.js'
import TopToolbar from '@/components/toolbar/TopToolbar.vue'
import CanvasToolbar from '@/components/toolbar/CanvasToolbar.vue'
import DiagramCanvas from '@/components/canvas/DiagramCanvas.vue'
import Minimap from '@/components/canvas/Minimap.vue'
import WhiteboardMinimap from '@/components/canvas/WhiteboardMinimap.vue'
import MindMapOverlay from '@/components/canvas/MindMapOverlay.vue'
import FlowchartOverlay from '@/components/canvas/FlowchartOverlay.vue'
import CollaboratorCursors from '@/components/canvas/CollaboratorCursors.vue'
import CommentPinsLayer from '@/components/comments/CommentPinsLayer.vue'
import CommentsPanel from '@/components/comments/CommentsPanel.vue'
import ViewportControls from '@/components/floating/ViewportControls.vue'
import ShortcutsDialog from '@/components/ShortcutsDialog.vue'
import { createComments, provideComments } from '@/composables/useComments.js'

const props = defineProps({
  name: { type: String, required: true },
  // The loaded document resource. Mounted only once its doc has arrived (#173),
  // so the store is always hydrated from the real document, never from a blank
  // one that a refused load left behind.
  diagram: { type: Object, required: true },
})

const diagram = props.diagram
const store = createDiagramStore(parseDiagramDocument(diagram.doc?.document), props.name)
const editorUi = createEditorUi()
const whiteboardUi = useWhiteboardUi()
// editorUi is created per editor, but mindmapUi is a module singleton whose fields
// all hold node ids — and node ids are per-document counters, so they repeat across
// maps. Clear it as each document loads, or leftovers (a branch focus, a half-armed
// cross-link) silently re-attach to whichever node shares that id here. The
// flowchart and whiteboard editor-UI singletons hold the same kind of per-document
// id state and are cleared for the same reason.
resetMindmapUi()
resetFlowchartUi()
whiteboardUi.reset()
provideDiagramStore(store)
provideEditorUi(editorUi)

// Comments (#108). Provided for the toolbar toggle, the canvas pins, and the side
// panel; loaded once mounted (keyed by the diagram name). Server-backed (see
// useComments) so comment-level users — who never join the peer-to-peer edit room —
// still see and post comments.
const comments = provideComments(createComments(props.name))

// Active mode module for this diagram's type (spec diagram-types §0/G1). The
// unified canvas keeps its own strategy throughout: a mind map / flowchart on it
// is an ordinary canvas object edited in place, not a container the editor
// switches into (#45).
const modeStrategy = computed(() => getModeStrategy(store.state.diagramType))
provideModeStrategy(modeStrategy)

// Which type's editing CHROME the selection belongs to — the node toolbars, the
// selection editors and, from #359 on, the static canvas toolbar. The rule and
// the reasons behind each of its branches live in useSelectionContext, where they
// can be unit tested; this file cannot mount in the node env. Provided so the
// toolbar and the editors read one answer instead of two.
const { chromeType } = provideSelectionContext(
  createSelectionContext(store, whiteboardUi, modeStrategy),
)

// Surface-interaction delegation seam (spec diagram-types Part G1/G4). The active
// type's interaction composable registers its handler object into this ref via
// registerModeInteraction(); DiagramCanvas injects + delegates to it. Provided
// here so it lives for the editor's lifetime regardless of which type loads.
provideModeInteraction()

// Real-time co-editing (Yjs + y-webrtc) + live cursors, keyed by the diagram name.
// Created before autosave so its CRDT snapshot rides along with each save, keeping
// the offline cache and the server one lineage (crdt_state on Draw Diagram).
const collab = useCollaboration(
  store,
  editorUi,
  props.name,
  () => diagram.doc?.crdt_state || null,
  () => diagram.doc?.document || null,
)
// The peer getter lets autosave tell a save race against a co-editor (retry — we
// hold their edits already, via Yjs) from a genuine second session (freeze).
const autosave = useAutosave(
  store,
  diagram,
  collab.snapshot,
  () => collab.collaborators.value.length > 0,
)
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

// The doc may arrive after mount; load it into the store once it lands. Reset the
// mind-map chrome with it — this fires for a late-arriving document and for any
// in-place document swap, neither of which re-runs setup.
watch(
  () => diagram.doc?.document,
  (raw) => {
    if (raw) {
      resetMindmapUi()
      resetFlowchartUi()
      whiteboardUi.reset()
      store.loadDocument(parseDiagramDocument(raw))
    }
  },
)

// Every type now opens on a plain white canvas (S6); guides are off by default
// (editorUi.state.gridVisible) and turned on from the toolbar's Canvas menu.

function rename(title) {
  diagram.setValue.submit({ title })
}

// Consume the ?new=1 flag once TitleEditor (a child, mounted first) has read it,
// so a later refresh of this URL won't re-open the title editor.
const route = useRoute()
const router = useRouter()
onMounted(() => {
  // Load this diagram's comment threads once (realtime keeps them fresh after).
  comments.load()
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
  <div class="flex h-screen flex-col bg-surface-base text-ink-gray-9">
    <TopToolbar
      :title="diagram.doc?.title || 'Untitled diagram'"
      :save-status="autosave.status.value"
      :save-message="autosave.frozen.value || ''"
      @update:title="rename"
    />

    <!-- Static canvas toolbar (#359): below the title bar, above the ruler, and
         spanning the full width so it also clears the comments panel. -->
    <CanvasToolbar />

    <div class="flex min-h-0 flex-1">
      <main class="relative min-h-0 min-w-0 flex-1">
        <DiagramCanvas />
        <!-- Comment pins over the canvas (#108): follow pan/zoom + their shape. -->
        <CommentPinsLayer />
        <Minimap />
        <WhiteboardMinimap v-if="modeStrategy.type === 'whiteboard'" />
        <MindMapOverlay v-if="chromeType === 'mindmap'" />
        <FlowchartOverlay v-if="chromeType === 'flowchart'" />
        <!-- Every selection's controls are on the static canvas toolbar now
             (#359). What is left in here is canvas chrome: the pins, the
             navigators, the per-type empty-state prompts and the cursors. -->
        <CollaboratorCursors :collaborators="collab.collaborators.value" :set-cursor="collab.setCursor" />
        <ViewportControls />
      </main>

      <!-- Comments side panel (#108), docked right when open. -->
      <CommentsPanel v-if="editorUi.state.commentsPanelOpen" />
    </div>

    <ShortcutsDialog />
  </div>
</template>
