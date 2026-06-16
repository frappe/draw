<script setup>
// New-diagram popup (spec §2, README §2). Four type cards (only Block diagram
// enabled; three "Coming soon", disabled) + six starter templates rendered as
// live SVG mini-previews. Choosing either emits a `create` payload carrying the
// pre-filled diagram document + a title, then closes. Templates are just
// pre-filled JSON documents (spec §2/§11.3).
import { computed } from 'vue'
import { Dialog, FeatherIcon } from 'frappe-ui'
import { TEMPLATES } from '@/data/templates.js'
import { documentToSvg } from '@/composables/useThumbnail.js'

defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'create'])

const types = [
  { key: 'block', name: 'Block diagram', hint: 'Boxes, arrows, flows', icon: 'box', enabled: true },
  { key: 'mindmap', name: 'Mind map', hint: 'Trees, ideas', icon: 'git-branch', enabled: false },
  { key: 'process', name: 'Process chart', hint: 'Steps, gateways', icon: 'activity', enabled: false },
  { key: 'whiteboard', name: 'Whiteboard', hint: 'Freeform', icon: 'edit-3', enabled: false },
]

// Pre-rendered SVG previews keep the template grid in sync with the canvas.
const previews = computed(() =>
  TEMPLATES.map((template) => ({ ...template, svg: documentToSvg(template.document) })),
)

function close() {
  emit('update:modelValue', false)
}

function chooseType(type) {
  if (!type.enabled) return
  chooseTemplate(TEMPLATES[0])
}

function chooseTemplate(template) {
  emit('create', { type: 'block', template: template.key, title: template.title, document: template.document })
  close()
}
</script>

<template>
  <Dialog :modelValue="modelValue" :options="{ size: '2xl' }" @update:modelValue="emit('update:modelValue', $event)">
    <template #body-content>
      <div class="mb-4 flex items-start justify-between">
        <div>
          <h2 class="text-[19px] font-bold text-ink-gray-9">Create a new diagram</h2>
          <p class="mt-0.5 text-[13px] text-ink-gray-5">Pick a type, or start from a template.</p>
        </div>
        <button class="text-ink-gray-5 hover:text-ink-gray-8" @click="close">
          <FeatherIcon name="x" class="h-4 w-4" />
        </button>
      </div>

      <div class="mb-5 grid grid-cols-4 gap-2.5">
        <button
          v-for="type in types"
          :key="type.key"
          :disabled="!type.enabled"
          class="relative flex flex-col gap-1.5 rounded-md border p-3 text-left transition-colors"
          :class="type.enabled
            ? 'border-[1.5px] border-ink-gray-9 hover:bg-surface-gray-1'
            : 'cursor-default border-outline-gray-1 bg-surface-gray-1 opacity-70'"
          @click="chooseType(type)"
        >
          <FeatherIcon :name="type.icon" class="h-[18px] w-[18px] text-ink-gray-8" />
          <div class="text-[13px] font-semibold text-ink-gray-9">{{ type.name }}</div>
          <div class="text-[11px] text-ink-gray-5">{{ type.hint }}</div>
          <span
            v-if="!type.enabled"
            class="absolute right-2 top-2 rounded-full bg-surface-gray-3 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-gray-6"
          >
            Coming soon
          </span>
        </button>
      </div>

      <div class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-gray-5">
        Start from a template
      </div>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="template in previews"
          :key="template.key"
          class="overflow-hidden rounded-md border border-outline-gray-1 text-left hover:border-outline-gray-3"
          @click="chooseTemplate(template)"
        >
          <div class="h-16 border-b border-outline-gray-1 bg-surface-gray-1 p-1.5" v-html="template.svg" />
          <div class="px-2 py-1.5 text-[12px] font-semibold text-ink-gray-8">{{ template.title }}</div>
        </button>
      </div>
    </template>
  </Dialog>
</template>
