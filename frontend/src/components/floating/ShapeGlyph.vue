<script setup>
// Small outline glyph that draws the ACTUAL shape a palette tile inserts, so the
// icon always matches the shape (#97/#128/#131). Flowchart glyphs reuse the real
// on-canvas geometry (nodeShape) scaled to fit, so the picker and the ⊕-menu read
// identically. Block shapes + the mind-map mark are hand-drawn here. Styled like a
// Lucide icon (24 viewBox, stroke currentColor, round joins) so it sits beside them.
import { computed } from 'vue'
import { NODE_TYPE_META } from '@/diagram/flowchartModel.js'
import { nodeShape } from '@/diagram/flowchartShapes.js'

const props = defineProps({
  family: { type: String, default: 'block' }, // 'block' | 'flowchart' | 'mindmap'
  type: { type: String, default: '' },
})

const BOX = 24
const FIT = 18 // longest side of the shape inside the 24×24 box

// Flowchart: the real node geometry at its natural aspect, scaled to fit + centred.
const flow = computed(() => {
  if (props.family !== 'flowchart') return null
  const meta = NODE_TYPE_META[props.type] || NODE_TYPE_META.process
  const scale = FIT / Math.max(meta.w, meta.h)
  const w = meta.w * scale
  const h = meta.h * scale
  return { w, h, tx: (BOX - w) / 2, ty: (BOX - h) / 2, shape: nodeShape(props.type, w, h) }
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${BOX} ${BOX}`"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <!-- Flowchart node: reuse the on-canvas shape geometry. -->
    <g v-if="family === 'flowchart' && flow" :transform="`translate(${flow.tx} ${flow.ty})`">
      <rect v-if="flow.shape.kind === 'rect'" x="0" y="0" :width="flow.w" :height="flow.h" :rx="flow.shape.rx" />
      <ellipse
        v-else-if="flow.shape.kind === 'ellipse'"
        :cx="flow.w / 2"
        :cy="flow.h / 2"
        :rx="flow.w / 2"
        :ry="flow.h / 2"
      />
      <polygon v-else-if="flow.shape.kind === 'polygon'" :points="flow.shape.points" />
      <path v-else-if="flow.shape.kind === 'path'" :d="flow.shape.d" />
    </g>

    <!-- Block shapes. -->
    <template v-else-if="family === 'block'">
      <rect v-if="type === 'rectangle'" x="2" y="6" width="20" height="12" rx="1.5" />
      <rect v-else-if="type === 'square'" x="5" y="5" width="14" height="14" rx="1.5" />
      <rect v-else-if="type === 'rounded'" x="2" y="6" width="20" height="12" rx="4.5" />
      <ellipse v-else-if="type === 'ellipse'" cx="12" cy="12" rx="10" ry="7" />
      <polygon v-else-if="type === 'triangle'" points="12,3 22,20 2,20" />
      <polygon v-else-if="type === 'diamond'" points="12,2 22,12 12,22 2,12" />
      <polygon v-else-if="type === 'hexagon'" points="7,4 17,4 22,12 17,20 7,20 2,12" />
      <!-- Freely-drawn polygon (#139): an irregular outline signals "place your own
           vertices", distinct from the fixed presets above. -->
      <polygon v-else-if="type === 'polygon'" points="4,9 11,3 20,7 17,20 7,18" />
      <path v-else-if="type === 'arrow'" d="M2 9 H13 V5 L22 12 L13 19 V15 H2 Z" />
    </template>

    <!-- Mind map (#255): a single parent node on the left with three curved
         connectors branching off to the right — the "Parent Node" glyph. -->
    <template v-else-if="family === 'mindmap'">
      <rect x="2" y="9" width="7" height="6" rx="2" />
      <path d="M9 12 C13 12 14 5 20 5" />
      <path d="M9 12 H20" />
      <path d="M9 12 C13 12 14 19 20 19" />
    </template>
  </svg>
</template>
