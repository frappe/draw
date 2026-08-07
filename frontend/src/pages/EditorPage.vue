<script setup>
// Editor route — loads the Draw Diagram document and only then mounts the editor.
//
// A refused load is terminal (#173). Opening a diagram you cannot read used to
// fall through to EditorShell with an empty document: a fully editable canvas
// titled "Untitled diagram" with a green "Saved" indicator, while every request
// behind it 403'd. Nothing the user drew there could ever be written, and nothing
// said so. The document therefore has to exist before any of the editor —
// store, autosave, collaboration — is created at all.
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
</script>

<template>
  <div v-if="access === 'loading'" class="flex h-screen items-center justify-center bg-surface-base">
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
