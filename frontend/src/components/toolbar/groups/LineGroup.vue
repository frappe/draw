<script setup>
// A lone selected connector gets its line controls and nothing else (#361) —
// stroke, width, dash and arrowheads all live in ConnectorSection.
//
// The trigger PREVIEWS the selected line rather than naming it (#491). It carried
// `lucide-minus`, the plain bar #457 had already concluded does not read as a line
// tool — and it sat two controls away from the Lines INSERT menu, which #457 gave a
// proper glyph, so the bar had a good line icon and a bad one on it at once.
//
// Copying the insert glyph across was the wrong repair: the original complaint was
// that the two controls looked alike, and making them identical brings it back. So
// this one shows the line's OWN colour, weight and dash, the way Fill and Border
// preview their current value (StyleGroup). It contrasts with the insert glyph
// because it is not a generic mark at all — and it says which line is selected.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import ConnectorSection from '@/components/palette-right/ConnectorSection.vue'
import ToolbarButton from '../ToolbarButton.vue'

const props = defineProps({
  connector: { type: Object, required: true },
})

// The preview is drawn in a 16-unit box, so the canvas width is clamped to a range
// that still reads at icon size — 4px of stroke in a 16px box is a block, not a line.
const preview = computed(() => {
  const style = props.connector.style || {}
  const width = Math.min(3, Math.max(1, style.width || 2.2))
  return {
    color: style.color || '#7C7C7C',
    width,
    // The same pattern rule ConnectorView draws with, at the preview's own width.
    dash:
      style.dash === 'dashed'
        ? `${width * 3} ${width * 2}`
        : style.dash === 'dotted'
          ? `${width} ${width * 2}`
          : null,
  }
})
</script>

<template>
  <Popover>
    <template #trigger>
      <ToolbarButton label="Line">
        <template #icon>
          <svg class="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <line
              x1="1.5"
              y1="8"
              x2="14.5"
              y2="8"
              :stroke="preview.color"
              :stroke-width="preview.width"
              stroke-linecap="round"
              :stroke-dasharray="preview.dash"
            />
          </svg>
        </template>
      </ToolbarButton>
    </template>
    <template #default>
      <div class="max-h-[70vh] w-[300px] overflow-y-auto">
        <ConnectorSection :connector="connector" />
      </div>
    </template>
  </Popover>
</template>
