<script setup>
// Home page — composes the sidebar + tile grid (+ empty state) + trash view, and
// routes to the editor on create/open (spec §2). "Create" makes a unified canvas
// and lands straight on the editor — no type picker (canvas unification). No
// folders (#115): diagrams are one flat, pinnable list.
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import Sidebar from '@/components/home/Sidebar.vue'
import TileGrid from '@/components/home/TileGrid.vue'
import EmptyState from '@/components/home/EmptyState.vue'
import TrashView from '@/components/home/TrashView.vue'
import { diagrams, createDiagram } from '@/data/diagrams.js'

const router = useRouter()
const view = ref('home')

onMounted(() => diagrams.fetch())

const list = computed(() => diagrams.data || [])
const isEmpty = computed(() => list.value.length === 0)

const VIEW_TITLES = { home: 'Home', recent: 'Recent', all: 'All diagrams' }
const title = computed(() => VIEW_TITLES[view.value] || 'Home')

function navigate(next) {
  view.value = next
}

// Guard against double-submission: a fast double-click (or a stray double event)
// on "Create" would otherwise fire create() twice and insert two diagrams.
const isCreating = ref(false)
async function create() {
  if (isCreating.value) return
  isCreating.value = true
  try {
    // Every new diagram is a unified canvas now (canvas unification) — no type
    // picker; the user lands straight on the blank canvas and just starts drawing.
    const name = await createDiagram(undefined, null, 'unified', null)
    if (!name) throw new Error('Server returned no diagram name')
    diagrams.reload()
    // `new` selects the title for inline renaming on the fresh canvas.
    router.push({ name: 'Editor', params: { name }, query: { new: '1' } })
  } catch (error) {
    // Surface the real reason instead of failing silently (toasts aren't mounted).
    const detail = error?.messages?.join('\n') || error?.exc_type || error?.message || String(error)
    console.error('Create diagram failed:', error)
    window.alert('Could not create the diagram:\n\n' + detail)
  } finally {
    isCreating.value = false
  }
}

function open(name) {
  router.push({ name: 'Editor', params: { name } })
}
</script>

<template>
  <div class="flex h-screen">
    <Sidebar :active="view" @navigate="navigate" />

    <main class="min-h-0 flex-1 overflow-y-auto px-9 py-7">
      <TrashView v-if="view === 'trash'" />

      <template v-else>
        <div class="mb-6 flex items-center justify-between">
          <div class="text-[22px] font-bold text-ink-gray-9">{{ title }}</div>
          <Button variant="solid" :loading="isCreating" @click="create">
            <template #prefix><LucideIcon name="plus" class="h-4 w-4" /></template>
            Create
          </Button>
        </div>

        <EmptyState v-if="isEmpty" @create="create" />
        <TileGrid v-else :mode="view" @create="create" @open="open" />
      </template>
    </main>
  </div>
</template>
