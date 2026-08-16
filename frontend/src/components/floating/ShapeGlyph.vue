<script setup>
// Small outline glyph for the tile families Lucide cannot stand in for.
//
// Flowchart glyphs reuse the real on-canvas geometry (nodeShape) scaled to fit, so
// the picker and the ⊕-menu read identically — a terminator, a decision and a
// document have no Lucide equivalents, and a generic stand-in would stop saying
// which node the tile inserts. The mind-map mark is the "Parent Node" figure (#255).
//
// The block shapes left in #425: rectangle, ellipse and the rest each map onto a
// Lucide icon, and one drawn family beside a bar of Lucide tiles read as artwork
// from somewhere else. Styled like a Lucide icon so what remains still sits beside
// them: 24 viewBox, stroke currentColor, round caps and joins, and stroke-width
// 1.5 — frappe-ui normalises every Lucide icon to 1.5 (tailwind/lucideIconsPlugin),
// so the stock 2 this file used to carry painted every glyph 50% heavier than the
// icons next to it (#456). FIT matches lucide-square's 18-of-24 span for the same
// reason. Render these at size-4, the size frappe-ui gives a Button icon.
import { computed } from 'vue'
import { NODE_TYPE_META } from '@/diagram/flowchartModel.js'
import { nodeShape } from '@/diagram/flowchartShapes.js'
import { presetPolygonPoints } from '@/diagram/polygon.js'

const props = defineProps({
  // 'flowchart' | 'preset' | 'mindmap' | 'polygon-n' | 'line' | 'endpoint' | 'corner'
  family: { type: String, default: 'flowchart' },
  type: { type: String, default: '' },
})

const BOX = 24
const FIT = 18 // longest side of the shape inside the 24×24 box

// A preset block shape Lucide has no icon for — trapezoid, parallelogram (#470).
// Not drawn by hand: it reads the same normalised outline the canvas and the export
// render from, scaled into the box a Lucide icon fills, so the tile cannot show a
// different shape from the one it inserts.
const presetPoints = computed(() =>
  props.family === 'preset'
    ? presetPolygonPoints({ type: props.type, x: (BOX - FIT) / 2, y: (BOX - FIT) / 2, w: FIT, h: FIT })
    : '',
)

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
    stroke-width="1.5"
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

    <!-- Preset block shape (#470): the real outline, not a likeness of it. -->
    <polygon v-else-if="family === 'preset'" :points="presetPoints" />

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

    <!-- Line (#457): a diagonal segment between two endpoint dots. `lucide-minus`
         read as a subtract sign, and Lucide ships no straight line with endpoints.
         The dots are lucide-spline's own (r=2 at 5,19 and 19,5) and the segment
         stops at their edges the way spline's arc does, so the straight tile and
         the curved one — which now wears spline — read as a pair. -->
    <template v-else-if="family === 'line'">
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
      <path d="M6.41 17.59 L17.59 6.41" />
    </template>

    <!-- Mind map (#255): a single parent node on the left with three curved
         connectors branching off to the right — the "Parent Node" glyph. -->
    <template v-else-if="family === 'mindmap'">
      <rect x="2" y="9" width="7" height="6" rx="2" />
      <path d="M9 12 C13 12 14 5 20 5" />
      <path d="M9 12 H20" />
      <path d="M9 12 C13 12 14 19 20 19" />
    </template>

    <!-- Connector endpoint (#490): a shaft ending in a SOLID triangle, because that
         is what ConnectorMarker draws (`M0,0 L10,5 L0,10 z`). Lucide is stroked
         outlines throughout, so `lucide-arrow-right` — a shaft with two open
         diagonals — showed an open arrowhead the renderer never produces, and read
         as the "crooked arrow" in the report.
         The head keeps the marker's square 1:1 proportions, and is fill-only: a
         stroke on it would round the point off against the caps set above. -->
    <template v-else-if="family === 'endpoint'">
      <path d="M4 12 H12" />
      <path d="M12 8 L20 12 L12 16 Z" fill="currentColor" stroke="none" />
    </template>

    <!-- Elbow corner (#493): the same L-bend drawn twice, once rounded and once
         square, so the pair is read by the corner alone rather than by two
         differently-shaped figures. Lucide ships no such pair. -->
    <template v-else-if="family === 'corner'">
      <path v-if="type === 'sharp'" d="M6 6 V18 H18" />
      <path v-else d="M6 6 V12 Q6 18 12 18 H18" />
    </template>
  </svg>
</template>
