<script setup>
// Read-only viewer (spec §9): canvas only, no palettes, no export. Zoom and pan
// are allowed; a small "Made with Frappe Draw" footer sits at the bottom.
// Private diagrams (or no access) show a "You need access" page, not a 404.
// Fetches via a guest-allowed backend method when present, else the document
// resource; either path surfaces a permission error as the access-denied state.
import { ref, computed, onMounted } from 'vue'
import { Button, Spinner } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { call } from 'frappe-ui'
import { useRouter } from 'vue-router'
import DiagramCanvas from '@/components/canvas/DiagramCanvas.vue'
import PresenceAvatars from '@/components/toolbar/PresenceAvatars.vue'
import Logomark from '@/components/Logomark.vue'
import { createDiagramStore, provideDiagramStore } from '@/stores/useDiagramStore.js'
import { createEditorUi, provideEditorUi } from '@/stores/useEditorUi.js'
import { provideModeStrategy, getModeStrategy } from '@/stores/useModeStrategy.js'
import { provideModeInteraction } from '@/composables/useModeInteraction.js'
import { loadDiagram } from '@/data/diagrams.js'
import { parseDiagramDocument } from '@/diagram/schema.js'

const PUBLIC_METHOD = 'frappe_draw.api.diagram.get_public_diagram'

const props = defineProps({
  name: { type: String, required: true },
})

const router = useRouter()
const status = ref('loading') // 'loading' | 'ready' | 'denied'
const store = createDiagramStore()
const editorUi = createEditorUi()
provideDiagramStore(store)
// Pan tool by default so the viewer can move around without any palette chrome;
// hide the editor-only grid so the viewer shows the diagram alone.
editorUi.state.tool = 'hand'
editorUi.state.gridVisible = false
provideEditorUi(editorUi)

// DiagramCanvas needs the active mode strategy + the interaction seam (same as
// the editor) — without these it can't render. Strategy tracks the loaded type.
const modeStrategy = computed(() => getModeStrategy(store.state.diagramType))
provideModeStrategy(modeStrategy)
provideModeInteraction()

onMounted(load)

async function load() {
  const raw = await fetchPublicDocument(props.name)
  if (raw == null) {
    status.value = 'denied'
    return
  }
  store.loadDocument(parseDiagramDocument(raw))
  status.value = 'ready'
}

// Returns the document (string/object), or null when access is denied / missing.
async function fetchPublicDocument(name) {
  try {
    const result = await call(PUBLIC_METHOD, { name })
    return result?.document ?? result ?? null
  } catch (error) {
    if (!isMethodMissing(error)) return null
    return fetchViaResource(name)
  }
}

// Fallback for before the guest endpoint exists: the document resource will only
// succeed when the viewer has permission (owner, or guest on a public diagram).
async function fetchViaResource(name) {
  const diagram = loadDiagram(name)
  try {
    await diagram.reload()
    return diagram.doc?.document ?? null
  } catch (error) {
    return null
  }
}

function isMethodMissing(error) {
  const message = String(error?.message || error?.exc_type || error || '')
  return /404|DoesNotExist|Not Found|AttributeError|ModuleNotFound/i.test(message)
}
</script>

<template>
  <div class="flex h-screen flex-col bg-surface-white">
    <main class="relative min-h-0 flex-1">
      <div v-if="status === 'loading'" class="flex h-full items-center justify-center">
        <Spinner class="h-6 w-6 text-ink-gray-5" />
      </div>

      <div
        v-else-if="status === 'denied'"
        class="flex h-full flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2">
          <LucideIcon name="lock" class="h-5 w-5 text-ink-gray-5" />
        </div>
        <div>
          <h1 class="text-lg font-semibold text-ink-gray-9">You need access</h1>
          <p class="mt-1 max-w-sm text-sm text-ink-gray-5">
            This diagram is private. Ask the owner to turn on global access, or sign in
            with an account that can view it.
          </p>
        </div>
        <Button variant="subtle" @click="router.push({ name: 'Home' })">
          Go to Frappe Draw
        </Button>
      </div>

      <DiagramCanvas v-else />

      <!-- Presence: viewers (incl. guests) of the shared diagram (spec 11.3). -->
      <div v-if="status === 'ready'" class="absolute right-3 top-3 z-10">
        <PresenceAvatars />
      </div>
    </main>

    <footer
      class="flex flex-none items-center justify-center gap-1.5 border-t border-outline-gray-1 bg-surface-white py-2 text-[11px] text-ink-gray-5"
    >
      <Logomark :size="14" />
      Made with Frappe Draw
    </footer>
  </div>
</template>
