<script setup>
// Attach a hyperlink to the selected object(s) (spec 6.5 — generalised from the
// sticky-note link). Stored as shape.link; ShapeView renders a small badge that
// opens it. A bare "example.com" is normalised to https:// on save.
import { computed } from 'vue'
import { FeatherIcon } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'

const store = useDiagramStore()
const selectedIds = computed(() => store.selectedShapes.map((s) => s.id))
const reference = computed(() => store.selectedShapes[0])
const link = computed(() => reference.value?.link || '')

function setLink(value) {
  const url = normalize(value)
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { link: url })
}

function clearLink() {
  if (selectedIds.value.length) store.updateShapes(selectedIds.value, { link: '' })
}

// Add a scheme when the user types a bare host; leave mailto:/relative as-is.
function normalize(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (/^(https?:|mailto:|\/)/i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
</script>

<template>
  <PaletteSection label="Link">
    <div class="flex items-center gap-1.5 rounded-md border border-outline-gray-2 px-2">
      <FeatherIcon name="link" class="h-3.5 w-3.5 flex-none text-ink-gray-5" />
      <input
        :value="link"
        placeholder="Add a link…"
        class="h-7 w-full bg-transparent text-[12px] text-ink-gray-8 outline-none"
        @change="setLink($event.target.value)"
      />
      <button
        v-if="link"
        class="flex h-5 w-5 flex-none items-center justify-center rounded text-ink-gray-5 hover:bg-surface-gray-2"
        title="Remove link"
        aria-label="Remove link"
        @click="clearLink"
      >
        <FeatherIcon name="x" class="h-3.5 w-3.5" />
      </button>
    </div>
  </PaletteSection>
</template>
