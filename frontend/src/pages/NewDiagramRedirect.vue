<script setup>
// Landing page for the `/new` route (#105): the target of Frappe Drive's
// "+ Create → Diagram (in this folder)". It creates a fresh unified diagram
// (optionally inside the Drive folder passed as `?parent=<id>`) and redirects to
// the editor. No UI to speak of — just a brief "Creating…" while the round-trip
// runs, or a small error with a way Home if the create fails.
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button, Spinner } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { createAndOpenDiagram } from './newDiagram.js'

const router = useRouter()
const route = useRoute()
const failed = ref(false)

onMounted(async () => {
  const parent = route.query.parent || null
  try {
    await createAndOpenDiagram(router, parent)
  } catch (error) {
    // Don't strand the user on a blank spinner — surface a short error and a
    // way Home. The diagram wasn't created, so there's nothing to recover.
    console.error('Create diagram failed:', error)
    failed.value = true
  }
})
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-surface-base">
    <div v-if="!failed" class="flex flex-col items-center gap-3">
      <Spinner class="h-6 w-6 text-ink-gray-5" />
      <p class="text-sm text-ink-gray-5">Creating your diagram…</p>
    </div>

    <div v-else class="flex flex-col items-center gap-4 px-6 text-center">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2">
        <LucideIcon name="alert-triangle" class="h-5 w-5 text-ink-gray-5" />
      </div>
      <div>
        <h1 class="text-lg font-semibold text-ink-gray-9">Couldn't create the diagram</h1>
        <p class="mt-1 max-w-sm text-sm text-ink-gray-5">
          Something went wrong. Please try again from the Frappe Draw home.
        </p>
      </div>
      <Button variant="subtle" @click="router.replace({ name: 'Home' })">
        Go to Frappe Draw
      </Button>
    </div>
  </div>
</template>
