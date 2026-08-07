<script setup>
// Editor route — loads the Draw Diagram document and only then mounts the editor.
//
// A refused load is terminal (#173). Opening a diagram you cannot read used to
// fall through to EditorShell with an empty document: a fully editable canvas
// titled "Untitled diagram" with a green "Saved" indicator, while every request
// behind it 403'd. Nothing the user drew there could ever be written, and nothing
// said so. The document therefore has to exist before any of the editor —
// store, autosave, collaboration — is created at all.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Button, Spinner } from 'frappe-ui'
import { useRouter } from 'vue-router'
import { loadDiagram } from '@/data/diagrams.js'
import { useDiagramAccess } from '@/composables/useDiagramAccess.js'
import EditorShell from '@/pages/EditorShell.vue'
import AccessNotice from '@/components/AccessNotice.vue'

const props = defineProps({
  name: { type: String, required: true },
})

const router = useRouter()
const diagram = loadDiagram(props.name)
const access = useDiagramAccess(diagram)

// design/SPEC.md: desktop only, min width 1280px, no touch/mobile editor. Below
// that the toolbar, minimap and floating palette overlap and steal each other's
// pointer events (#175). The gate lives HERE, above EditorShell, so at an
// unsupported width the editor — store, autosave, collaboration — is never
// created at all, rather than mounted-but-hidden behind a notice.
const MIN_EDITOR_WIDTH = 1280
const viewportWidth = ref(window.innerWidth)
const tooNarrow = computed(() => viewportWidth.value < MIN_EDITOR_WIDTH)
function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}
onMounted(() => window.addEventListener('resize', updateViewportWidth))
onBeforeUnmount(() => window.removeEventListener('resize', updateViewportWidth))
</script>

<template>
  <div
    v-if="tooNarrow"
    class="flex h-screen flex-col items-center justify-center gap-4 bg-surface-base px-6 text-center"
  >
    <h1 class="text-lg font-semibold text-ink-gray-9">Open on a larger screen</h1>
    <p class="max-w-sm text-sm text-ink-gray-5">
      The diagram editor needs at least {{ MIN_EDITOR_WIDTH }}px of width. Try a laptop or
      desktop browser.
    </p>
    <Button variant="subtle" @click="router.push({ name: 'Home' })">Go to Frappe Draw</Button>
  </div>

  <div v-else-if="access === 'loading'" class="flex h-screen items-center justify-center bg-surface-base">
    <Spinner class="h-6 w-6 text-ink-gray-5" />
  </div>

  <AccessNotice
    v-else-if="access === 'denied'"
    title="You don't have access to this diagram"
    message="It may have been deleted, or the owner may not have shared it with you. Ask them for access, or open one of your own diagrams."
  >
    <Button variant="subtle" @click="router.push({ name: 'Home' })">Go to Frappe Draw</Button>
  </AccessNotice>

  <EditorShell v-else :name="name" :diagram="diagram" />
</template>
