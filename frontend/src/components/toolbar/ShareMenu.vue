<script setup>
// Share control (spec §9): a single "Allow global access" toggle (off by
// default) + Copy link, in a frappe-ui Dialog. Off → only the owner can open the
// URL; on → anyone with the link gets view-only access via the viewer route.
// The diagram resource is loaded from the current route name (cached, so this
// reuses the editor's resource) since TopToolbar mounts this without props.
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Dialog, Switch, FeatherIcon } from 'frappe-ui'
import { loadDiagram } from '@/data/diagrams.js'
import { useShare } from '@/composables/useShare.js'

const route = useRoute()
const diagram = loadDiagram(route.params.name)
const share = useShare(diagram)

const open = ref(false)
const accessLabel = computed(() =>
  share.isPublic.value ? 'Anyone with the link can view' : 'Only you can open this diagram',
)
</script>

<template>
  <Button variant="outline" @click="open = true">
    <template #prefix><FeatherIcon name="share-2" class="h-4 w-4" /></template>
    Share
  </Button>

  <Dialog v-model="open" :options="{ title: 'Share diagram', size: 'md' }">
    <template #body-content>
      <div class="space-y-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-base font-medium text-ink-gray-9">Allow global access</p>
            <p class="mt-0.5 text-sm text-ink-gray-5">{{ accessLabel }}</p>
          </div>
          <Switch
            :model-value="share.isPublic.value"
            :disabled="share.updating.value"
            @update:model-value="share.toggleGlobalAccess()"
          />
        </div>

        <div>
          <p class="mb-1.5 text-sm text-ink-gray-5">Link</p>
          <div class="flex items-center gap-2">
            <div
              class="min-w-0 flex-1 truncate rounded bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-7"
            >
              {{ share.shareLink.value || 'Save the diagram to get a link' }}
            </div>
            <Button
              variant="solid"
              :disabled="!share.shareLink.value"
              @click="share.copyLink()"
            >
              <template #prefix><FeatherIcon name="link" class="h-4 w-4" /></template>
              Copy link
            </Button>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>
