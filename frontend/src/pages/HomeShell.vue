<script setup>
// Home page — composes the sidebar + tile grid (+ empty state) + new-diagram
// dialog + trash view, and routes to the editor on create/open (spec §2).
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, FeatherIcon } from 'frappe-ui'
import Sidebar from '@/components/home/Sidebar.vue'
import TileGrid from '@/components/home/TileGrid.vue'
import EmptyState from '@/components/home/EmptyState.vue'
import TrashView from '@/components/home/TrashView.vue'
import NewDiagramDialog from '@/components/home/NewDiagramDialog.vue'
import { diagrams, createDiagram } from '@/data/diagrams.js'
import { folders } from '@/data/folders.js'

const router = useRouter()
const view = ref('all')
const showNewDiagram = ref(false)

onMounted(() => {
  diagrams.fetch()
  folders.fetch()
})

const list = computed(() => diagrams.data || [])
const isEmpty = computed(() => list.value.length === 0)

async function create(payload = {}) {
  const name = await createDiagram(payload.title, payload.document, payload.type || 'block')
  diagrams.reload()
  router.push({ name: 'Editor', params: { name } })
}

function open(name) {
  router.push({ name: 'Editor', params: { name } })
}
</script>

<template>
  <div class="flex h-screen">
    <Sidebar :active="view" @navigate="view = $event" />

    <main class="min-h-0 flex-1 overflow-y-auto px-9 py-7">
      <TrashView v-if="view === 'trash'" />

      <template v-else>
        <div class="mb-6 flex items-end justify-between">
          <div>
            <h1 class="text-[22px] font-bold text-ink-gray-9">All diagrams</h1>
            <p class="mt-1 text-[13px] text-ink-gray-5">{{ list.length }} diagrams</p>
          </div>
          <Button variant="solid" @click="showNewDiagram = true">
            <template #prefix><FeatherIcon name="plus" class="h-4 w-4" /></template>
            Create
          </Button>
        </div>

        <EmptyState v-if="isEmpty" @create="showNewDiagram = true" />
        <TileGrid v-else :diagrams="list" @create="showNewDiagram = true" @open="open" />
      </template>
    </main>

    <NewDiagramDialog v-model="showNewDiagram" @create="create" />
  </div>
</template>
