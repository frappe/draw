<script setup>
// The editor itself — owns the diagram store. Takes the already-loaded Draw
// Diagram resource from EditorPage (which is what decides whether the document
// loaded at all), parses its document, creates + provides the store and editor
// UI, then composes the toolbar, palettes, canvas, and floating palette
// (CONVENTIONS integration).
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parseDiagramDocument, isUnifiedDocument } from '@/diagram/schema.js'
import { isMindmapShape, isFlowchartShape } from '@/diagram/freeFloating.js'
import { createDiagramStore, provideDiagramStore } from '@/stores/useDiagramStore.js'
import { createEditorUi, provideEditorUi } from '@/stores/useEditorUi.js'
import { provideModeStrategy, getModeStrategy } from '@/stores/useModeStrategy.js'
import { resetMindmapUi } from '@/stores/mindmapUi.js'
import { resetFlowchartUi } from '@/stores/flowchartUi.js'
import { provideModeInteraction } from '@/composables/useModeInteraction.js'
import { useKeyboard, keyboardOwner } from '@/composables/useKeyboard.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useClipboard } from '@/composables/useClipboard.js'
import { useAutosave } from '@/composables/useAutosave.js'
import { useThumbnail } from '@/composables/useThumbnail.js'
import { useCollaboration } from '@/composables/useCollaboration.js'
import TopToolbar from '@/components/toolbar/TopToolbar.vue'
import DiagramCanvas from '@/components/canvas/DiagramCanvas.vue'
import Minimap from '@/components/canvas/Minimap.vue'
import WhiteboardMinimap from '@/components/canvas/WhiteboardMinimap.vue'
import MindMapOverlay from '@/components/canvas/MindMapOverlay.vue'
import FlowchartOverlay from '@/components/canvas/FlowchartOverlay.vue'
import BlockSelectionEditor from '@/components/floating/BlockSelectionEditor.vue'
import FlowchartSelectionEditor from '@/components/floating/FlowchartSelectionEditor.vue'
import FlowchartLayoutToolbar from '@/components/floating/FlowchartLayoutToolbar.vue'
import MindmapLayoutToolbar from '@/components/floating/MindmapLayoutToolbar.vue'
import WhiteboardSelectionEditor from '@/components/floating/WhiteboardSelectionEditor.vue'
import CollaboratorCursors from '@/components/canvas/CollaboratorCursors.vue'
import CommentPinsLayer from '@/components/comments/CommentPinsLayer.vue'
import CommentsPanel from '@/components/comments/CommentsPanel.vue'
import BottomPalette from '@/components/floating/BottomPalette.vue'
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
  // A migrated free-floating mind-map / flowchart node (#122) is a block shape: it
  // OWNS the mind-map/flowchart keyboard (Tab grows it), but its selection chrome is
  // the BLOCK editor, which actually edits the shape. The framed MindMapOverlay /
  // FlowchartOverlay read the now-empty sub-model (and would show its blank prompt),
  // so they must not mount for a migrated node.
  const selected = store.state.selection?.[0]
  const shape = selected && store.state.shapes?.find((s) => s.id === selected)
  if (isMindmapShape(shape) || isFlowchartShape(shape)) return 'block'
  return keyboardOwner(store) || 'block'
})

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
// (editorUi.state.gridVisible) and turned on from the bottom-palette control.

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

    <div class="flex min-h-0 flex-1">
      <main class="relative min-h-0 min-w-0 flex-1">
        <DiagramCanvas />
        <!-- Comment pins over the canvas (#108): follow pan/zoom + their shape. -->
        <CommentPinsLayer />
        <Minimap />
        <WhiteboardMinimap v-if="modeStrategy.type === 'whiteboard'" />
        <MindMapOverlay v-if="chromeType === 'mindmap'" />
        <FlowchartOverlay v-if="chromeType === 'flowchart'" />
        <!-- Also on the whiteboard: text/image are block shapes, so their format
             menu (font, size, colour…) is the block editor, shown when one is
             selected (S13/S14/U1). WhiteboardSelectionEditor handles board objects. -->
        <BlockSelectionEditor v-if="chromeType === 'block' || chromeType === 'whiteboard'" />
        <FlowchartSelectionEditor v-if="chromeType === 'flowchart'" />
        <!-- Whole-chart layout actions for a free-floating flowchart (#98). Self-
             gates on a selected 'flowchart-node' shape, so it is a no-op elsewhere. -->
        <FlowchartLayoutToolbar />
        <!-- Whole-tree layout action for a free-floating mind map (#122). Self-gates
             on a selected 'mindmap-node' shape. -->
        <MindmapLayoutToolbar />
        <WhiteboardSelectionEditor v-if="chromeType === 'whiteboard'" />
        <CollaboratorCursors :collaborators="collab.collaborators.value" :set-cursor="collab.setCursor" />
        <ViewportControls />
        <BottomPalette />
      </main>

      <!-- Comments side panel (#108), docked right when open. -->
      <CommentsPanel v-if="editorUi.state.commentsPanelOpen" />
    </div>

    <ShortcutsDialog />
  </div>
</template>
