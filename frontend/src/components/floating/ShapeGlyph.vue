<script setup>
// Small outline glyph for the two tile families Lucide cannot stand in for.
//
// Flowchart glyphs reuse the real on-canvas geometry (nodeShape) scaled to fit, so
// the picker and the ⊕-menu read identically — a terminator, a decision and a
// document have no Lucide equivalents, and a generic stand-in would stop saying
// which node the tile inserts. The mind-map mark is the "Parent Node" figure (#255).
//
// The block shapes left in #425: rectangle, ellipse and the rest each map onto a
// Lucide icon, and one drawn family beside a bar of Lucide tiles read as artwork
// from somewhere else. Styled like a Lucide icon (24 viewBox, stroke currentColor,
// round joins) so what remains still sits beside them.
import { computed } from 'vue'
import { NODE_TYPE_META } from '@/diagram/flowchartModel.js'
import { nodeShape } from '@/diagram/flowchartShapes.js'

const props = defineProps({
  // 'flowchart' | 'mindmap' | 'polygon-n'
  family: { type: String, default: 'flowchart' },
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

    <!-- Custom polygon (#451 item 2): the polygon outline with an "n" in the top
         right corner, saying the side count is the thing you choose. Lucide has a
         pentagon but nothing marked, so this one is drawn. The outline sits low
         and left to leave the marker its corner. -->
    <template v-else-if="family === 'polygon-n'">
      <polygon points="9,3.5 16.5,9 13.6,18 4.4,18 1.5,9" />
      <text
        x="24"
        y="8"
        text-anchor="end"
        font-size="11"
        font-weight="600"
        font-family="Inter, sans-serif"
        fill="currentColor"
        stroke="none"
      >
        n
      </text>
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
