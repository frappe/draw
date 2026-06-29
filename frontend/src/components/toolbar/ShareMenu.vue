<script setup>
// Share control (spec §9) — kept intentionally simple: a "Turn on sharing"
// toggle (off by default, view-only). When on, a single button below shows the
// link and copies it on click. No edit/collab roles, no embed.
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Dialog, Switch, FeatherIcon } from 'frappe-ui'
import { loadDiagram } from '@/data/diagrams.js'
import { useShare } from '@/composables/useShare.js'

const route = useRoute()
const diagram = loadDiagram(route.params.name)
const share = useShare(diagram)

const open = ref(false)
</script>

<template>
  <Button variant="outline" @click="open = true">
    <template #prefix><FeatherIcon name="share-2" class="h-4 w-4" /></template>
    Share
  </Button>

  <Dialog v-model="open" :options="{ title: 'Share diagram', size: 'md' }">
    <template #body-content>
      <div class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-base font-medium text-ink-gray-9">Turn on sharing</p>
            <p class="mt-0.5 text-sm text-ink-gray-5">
              {{ share.isPublic.value ? 'Anyone with the link can view this diagram' : 'Only you can open this diagram' }}
            </p>
          </div>
          <Switch
            :model-value="share.isPublic.value"
            :disabled="share.updating.value"
            @change="share.toggleGlobalAccess()"
          />
        </div>

        <!-- One-click copy: the whole button is the link; clicking copies it. -->
        <button
          v-if="share.isPublic.value && share.shareLink.value"
          class="flex w-full items-center gap-2 rounded-md border border-outline-gray-2 px-3 py-2 text-left hover:border-outline-gray-3 hover:bg-surface-gray-1"
          @click="share.copyLink()"
        >
          <FeatherIcon name="link" class="h-4 w-4 flex-none text-ink-gray-5" />
          <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-7">{{ share.shareLink.value }}</span>
          <span class="flex flex-none items-center gap-1 text-[12px] font-medium text-ink-gray-6">
            <FeatherIcon name="copy" class="h-3.5 w-3.5" /> Copy
          </span>
        </button>
      </div>
    </template>
  </Dialog>
</template>
