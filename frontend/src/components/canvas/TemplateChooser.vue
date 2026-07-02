<script setup>
// On-canvas blank-vs-template chooser (spec 10.1 flow). Shown right after a new
// diagram opens (?choose=1): the type was already picked on Home, so here — over
// the canvas — you either keep the blank canvas or drop in a template for this
// type. Dismisses by clearing the query flag so a refresh won't re-open it.
import { computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FeatherIcon } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { allTemplates } from '@/composables/useTemplates.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const route = useRoute()
const router = useRouter()

const TYPE_NAME = {
  block: 'block diagram',
  mindmap: 'mind map',
  flowchart: 'flowchart',
  whiteboard: 'whiteboard',
}

const show = computed(() => route.query.choose === '1')
const type = computed(() => store.state.diagramType || 'block')
const typeName = computed(() => TYPE_NAME[type.value] || 'diagram')
const templates = computed(() => allTemplates(type.value))
const others = computed(() => templates.value.filter((t) => t.key !== 'blank'))

function dismiss() {
  const query = { ...route.query }
  delete query.choose
  router.replace({ name: route.name, params: route.params, query })
}

function pickBlank() {
  dismiss()
}

function pickTemplate(t) {
  const doc = t.build()
  if (doc) {
    store.loadDocument(doc)
    nextTick(() => editorUi.fit?.())
  }
  dismiss()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-6" @click.self="pickBlank">
      <div class="w-full max-w-xl rounded-xl border border-outline-gray-2 bg-surface-white p-6 shadow-2xl">
        <div class="mb-4 flex items-start justify-between">
          <div>
            <h2 class="text-lg font-semibold text-ink-gray-9">Start your {{ typeName }}</h2>
            <p class="text-[13px] text-ink-gray-5">Begin from scratch, or pick a template.</p>
          </div>
          <button class="flex h-7 w-7 items-center justify-center rounded-md text-ink-gray-5 hover:bg-surface-gray-2" aria-label="Close" @click="pickBlank">
            <FeatherIcon name="x" class="h-4 w-4" />
          </button>
        </div>

        <!-- Primary: blank canvas. -->
        <button
          class="flex w-full items-center gap-3.5 rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-4 text-left transition-colors hover:border-ink-gray-9 hover:bg-surface-gray-2"
          @click="pickBlank"
        >
          <div class="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-surface-white shadow-sm">
            <FeatherIcon name="file-plus" class="h-5 w-5 text-ink-gray-8" />
          </div>
          <div>
            <div class="text-[15px] font-semibold text-ink-gray-9">Start with a blank canvas</div>
            <div class="text-[12px] text-ink-gray-5">An empty {{ typeName }} — build it your way</div>
          </div>
          <FeatherIcon name="arrow-right" class="ml-auto h-4 w-4 text-ink-gray-5" />
        </button>

        <!-- Templates. -->
        <template v-if="others.length">
          <p class="mb-2 mt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Or choose a template</p>
          <div class="grid grid-cols-3 gap-2.5">
            <button
              v-for="t in others"
              :key="t.key"
              class="flex flex-col gap-1 rounded-md border border-outline-gray-2 p-3 text-left transition-colors hover:border-ink-gray-9 hover:bg-surface-gray-1"
              @click="pickTemplate(t)"
            >
              <FeatherIcon name="layout" class="h-[18px] w-[18px] text-ink-gray-7" />
              <div class="text-[13px] font-semibold text-ink-gray-9">{{ t.name }}</div>
              <div class="text-[11px] text-ink-gray-5">{{ t.hint }}</div>
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
