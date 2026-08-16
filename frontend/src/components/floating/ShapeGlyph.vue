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
  // 'flowchart' | 'preset' | 'mindmap' | 'polygon-n' | 'connector' | 'endpoint' | 'corner'
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

// The connector tiles (#499). `type` is the armed tool id, which says both axes:
// `line-` / `arrow-` for the ending, and the geometry after it. The three paths run
// between the same endpoints so the row differs only in what it is choosing.
//
// The head is the marker's own 1:1 triangle, rotated onto the 45-degree approach —
// stated as a path rather than a transform so it stays readable next to the others.
const CONNECTOR_PATHS = {
  straight: 'M6.41 17.59 L17.59 6.41',
  elbow: 'M5 17 V9 Q5 5 9 5 H17',
  curved: 'M6 18 C6 10 10 6 18 6',
}
const CONNECTOR_HEADS = {
  straight: 'M13.6 7.6 L20 4 L16.4 10.4 Z',
  elbow: 'M14.5 1.8 L21 5 L14.5 8.2 Z',
  curved: 'M14.4 2.4 L21 5 L18.4 11.6 Z',
}
const connector = computed(() => {
  if (props.family !== 'connector') return null
  const [ending, geometry] = String(props.type).split('-')
  const shape = CONNECTOR_PATHS[geometry] ? geometry : 'straight'
  return { arrow: ending === 'arrow', path: CONNECTOR_PATHS[shape], head: CONNECTOR_HEADS[shape] }
})

// A Lucide icon fills its box; a flowchart node is a letterbox. Fitting a node at
// its natural aspect made every tile a flat bar — a 160x72 Process came out 18x8 in
// a 24 box — which is what stopped the set sitting beside real Lucide icons (#505).
// So the aspect is COMPRESSED toward square rather than preserved. The silhouette is
// still each node's own; it is drawn at icon proportions instead of document ones.
const MAX_GLYPH_ASPECT = 1.6

// The geometry is measured at the node's FULL size and scaled by the transform,
// never rebuilt at glyph size. That matters for the radii: a terminator's is h/2 and
// a process's is a constant, so evaluating them at 18x8 made the constant one nearly
// a stadium too — Terminal and Process, the first two tiles in the menu, came out as
// the same picture twice. Scaled from full size they keep their real proportions.
const flow = computed(() => {
  if (props.family !== 'flowchart') return null
  const meta = NODE_TYPE_META[props.type] || NODE_TYPE_META.process
  const natural = meta.w / meta.h
  const aspect = Math.min(Math.max(natural, 1 / MAX_GLYPH_ASPECT), MAX_GLYPH_ASPECT)
  const w = aspect >= 1 ? FIT : FIT * aspect
  const h = aspect >= 1 ? FIT / aspect : FIT
  return {
    sx: w / meta.w,
    sy: h / meta.h,
    tx: (BOX - w) / 2,
    ty: (BOX - h) / 2,
    meta,
    shape: nodeShape(props.type, meta.w, meta.h),
  }
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
    <!-- vector-effect keeps the stroke at the 1.5 the <svg> sets: the group is
         scaled by about 0.1, which would otherwise draw a hairline. -->
    <g
      v-if="family === 'flowchart' && flow"
      :transform="`translate(${flow.tx} ${flow.ty}) scale(${flow.sx} ${flow.sy})`"
      vector-effect="non-scaling-stroke"
    >
      <rect
        v-if="flow.shape.kind === 'rect'"
        x="0"
        y="0"
        :width="flow.meta.w"
        :height="flow.meta.h"
        :rx="flow.shape.rx"
        vector-effect="non-scaling-stroke"
      />
      <ellipse
        v-else-if="flow.shape.kind === 'ellipse'"
        :cx="flow.meta.w / 2"
        :cy="flow.meta.h / 2"
        :rx="flow.meta.w / 2"
        :ry="flow.meta.h / 2"
        vector-effect="non-scaling-stroke"
      />
      <polygon v-else-if="flow.shape.kind === 'polygon'" :points="flow.shape.points" vector-effect="non-scaling-stroke" />
      <path v-else-if="flow.shape.kind === 'path'" :d="flow.shape.d" vector-effect="non-scaling-stroke" />
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

    <!-- The six connector tiles as ONE family (#499): three geometries, each drawn
         plain and with a head, so the menu reads as a matrix rather than as six
         unrelated pictures. Lucide has no such family — `minus` reads as a subtract
         sign (#457) and `corner-down-right` / `spline` say nothing about the ending.
         Every glyph runs bottom-left to top-right between the same two points, so
         only the thing being chosen differs. A line keeps the tail dot it starts
         from; an arrow trades the head dot for the filled triangle ConnectorMarker
         actually draws (#490), which is the whole distinction the row makes. -->
    <template v-else-if="family === 'connector'">
      <circle cx="5" cy="19" r="2" />
      <circle v-if="!connector.arrow" cx="19" cy="5" r="2" />
      <path :d="connector.path" />
      <path v-if="connector.arrow" :d="connector.head" fill="currentColor" stroke="none" />
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
