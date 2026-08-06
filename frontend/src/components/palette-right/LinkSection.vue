<script setup>
// Attach a hyperlink to the selected object(s) (spec 6.5 — generalised from the
// sticky-note link). Stored as shape.link; ShapeView renders a small badge that
// opens it. A bare "example.com" is normalised to https:// on save.
import { computed } from 'vue'
import { Button, TextInput } from 'frappe-ui'
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
    <TextInput
      class="w-full"
      variant="outline"
      :model-value="link"
      placeholder="Add a link…"
      label="Link URL"
      @update:model-value="setLink"
    >
      <template #prefix>
        <span class="lucide-link size-4 text-ink-gray-5" aria-hidden="true" />
      </template>
      <template v-if="link" #suffix>
        <Button
          variant="ghost"
          theme="gray"
          size="sm"
          icon="lucide-x"
          tooltip="Remove link"
          label="Remove link"
          @click="clearLink"
        />
      </template>
    </TextInput>
  </PaletteSection>
</template>
