<script setup>
// New-diagram popup (spec §2 + 10.1). Step 1: pick a type. Step 2: pick a
// template (Blank + built-in starters + your saved templates). Picking Blank is
// the original one-tap path. Selecting a template opens the editor pre-filled.
import { ref, computed } from 'vue'
import { Dialog, FeatherIcon } from 'frappe-ui'
import { allTemplates, deleteTemplate } from '@/composables/useTemplates.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'create'])

const types = [
  { key: 'block', name: 'Block diagram', hint: 'Boxes, arrows, flows', icon: 'box' },
  { key: 'mindmap', name: 'Mind map', hint: 'Trees, ideas', icon: 'git-branch' },
  { key: 'flowchart', name: 'Flowchart', hint: 'Steps, decisions', icon: 'activity' },
  { key: 'whiteboard', name: 'Whiteboard', hint: 'Freeform', icon: 'edit-3' },
]

// Roadmap — shown grayed out so users see what's coming. Not yet buildable.
const comingSoon = [
  { key: 'wireframe', name: 'Wireframe', hint: 'Mobile & web wireframes', icon: 'smartphone' },
  { key: 'designer', name: 'Designer', hint: 'Pro design — frames & layers', icon: 'pen-tool' },
  { key: 'paint', name: 'Paint', hint: 'Freeform painting', icon: 'droplet' },
  { key: 'notebook', name: 'Notebook', hint: 'Multi-page notes', icon: 'book-open' },
]

const TYPE_TITLE = {
  block: 'Untitled diagram',
  mindmap: 'Untitled mind map',
  flowchart: 'Untitled flowchart',
  whiteboard: 'Untitled whiteboard',
}

// Step state: which type's templates are showing (null → the type grid).
const selectedType = ref(null)
const templates = computed(() => (selectedType.value ? allTemplates(selectedType.value) : []))
const dialogTitle = computed(() =>
  selectedType.value ? `Start a ${typeName(selectedType.value)}` : 'Create a new diagram',
)

function typeName(key) {
  return (types.find((t) => t.key === key)?.name || 'diagram').toLowerCase()
}

function pickType(type) {
  selectedType.value = type.key
}

function pickTemplate(template) {
  const type = selectedType.value
  emit('create', { type, title: TYPE_TITLE[type] || 'Untitled diagram', document: template.build() })
  close()
}

function removeTemplate(template) {
  deleteTemplate(template.id)
}

function back() {
  selectedType.value = null
}

function close() {
  selectedType.value = null
  emit('update:modelValue', false)
}
</script>

<template>
  <Dialog
    :modelValue="modelValue"
    :options="{ size: 'xl', title: dialogTitle }"
    @update:modelValue="$event ? null : close()"
  >
    <template #body-content>
      <!-- Step 1: choose a type. -->
      <div v-if="!selectedType">
        <p class="-mt-1 mb-3 text-[13px] text-ink-gray-5">Pick a diagram type, then choose a template.</p>
        <div class="grid grid-cols-2 gap-2.5">
          <button
            v-for="type in types"
            :key="type.key"
            class="relative flex flex-col gap-1.5 rounded-md border border-outline-gray-2 p-3.5 text-left transition-colors hover:border-ink-gray-9 hover:bg-surface-gray-1"
            @click="pickType(type)"
          >
            <FeatherIcon :name="type.icon" class="h-[18px] w-[18px] text-ink-gray-8" />
            <div class="text-[13px] font-semibold text-ink-gray-9">{{ type.name }}</div>
            <div class="text-[11px] text-ink-gray-5">{{ type.hint }}</div>
          </button>
        </div>

        <p class="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Coming soon</p>
        <div class="grid grid-cols-2 gap-2.5">
          <div
            v-for="type in comingSoon"
            :key="type.key"
            class="relative flex cursor-not-allowed flex-col gap-1.5 rounded-md border border-outline-gray-2 p-3.5 text-left opacity-60"
            aria-disabled="true"
          >
            <FeatherIcon :name="type.icon" class="h-[18px] w-[18px] text-ink-gray-5" />
            <div class="text-[13px] font-semibold text-ink-gray-7">{{ type.name }}</div>
            <div class="text-[11px] text-ink-gray-5">{{ type.hint }}</div>
            <span
              class="absolute right-2 top-2 rounded-full bg-surface-gray-3 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-gray-6"
            >
              Soon
            </span>
          </div>
        </div>
      </div>

      <!-- Step 2: choose a template for the picked type. -->
      <div v-else>
        <button class="mb-3 flex items-center gap-1 text-[12px] text-ink-gray-6 hover:text-ink-gray-9" @click="back">
          <FeatherIcon name="chevron-left" class="h-4 w-4" /> All types
        </button>
        <div class="grid grid-cols-3 gap-2.5">
          <div v-for="t in templates" :key="t.key" class="group relative">
            <button
              class="flex h-full w-full flex-col gap-1 rounded-md border border-outline-gray-2 p-3.5 text-left transition-colors hover:border-ink-gray-9 hover:bg-surface-gray-1"
              @click="pickTemplate(t)"
            >
              <FeatherIcon :name="t.key === 'blank' ? 'file' : 'layout'" class="h-[18px] w-[18px] text-ink-gray-7" />
              <div class="text-[13px] font-semibold text-ink-gray-9">{{ t.name }}</div>
              <div class="text-[11px] text-ink-gray-5">{{ t.hint }}</div>
            </button>
            <button
              v-if="t.saved"
              class="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded text-ink-gray-5 hover:bg-surface-gray-3 group-hover:flex"
              title="Delete template"
              aria-label="Delete template"
              @click.stop="removeTemplate(t)"
            >
              <FeatherIcon name="x" class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>
