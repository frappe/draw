<script setup>
// Renders one shape (rectangle/ellipse/square/triangle/diamond/text) from a
// shape object. Geometry is in logical canvas units. Text boxes render with no
// fill and no border (spec §5.1). Interaction is layered on later.
import { computed, ref } from 'vue'
import { useTextEditing, shapeTextArea, textStyleCss, fitsWidthToText } from '@/composables/useTextEditing.js'
import { useAutoFitText } from '@/composables/useAutoFitText.js'
import { sanitizeRichText } from '@/utils/sanitizeHtml.js'
import { safeHref, safeImageSrc } from '@/utils/safeUrl.js'
import { nodeShape } from '@/diagram/flowchartShapes.js'
import { polygonPointsString } from '@/diagram/polygon.js'
import { shapeCornerRadius } from '@/diagram/shapeGeometry.js'
import { curveRadius } from '@/diagram/mindmapNodeStyle.js'
import { NODE_BORDER_ZONE } from '@/diagram/mindmapNodeShape.js'

const props = defineProps({
  shape: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})

const editing = useTextEditing()
const richEl = ref(null)

// Hide the static text while this shape is being edited (the editor overlay
// shows instead, avoiding double text).
const isEditingThis = computed(() => editing?.editingShapeId?.value === props.shape.id)

// Rich text renders as HTML in a foreignObject; legacy shapes with only a plain
// `content` string still render as a single SVG <text> (backward compatible).
//
// v-html'd, and the document may have been authored by whoever shared it, so the
// markup is sanitised first. A shape whose html sanitises away to nothing falls
// through to the plain-text branch below, which is why this stays falsy-or-markup.
const richHtml = computed(() => sanitizeRichText(props.shape.text?.html) || null)

// The link comes from the untrusted document, so only render the anchor for a
// safe scheme — a crafted `javascript:` link would otherwise execute in an SVG
// anchor when the badge is clicked on a shared/public diagram.
const safeLink = computed(() => safeHref(props.shape.link))

// Image sources come from the untrusted document; only render same-origin/data:
// images so a crafted external URL can't phone home when a shared diagram opens.
const safeSrc = computed(() => safeImageSrc(props.shape.src))
const textArea = computed(() => shapeTextArea(props.shape))
const richStyle = computed(() => {
  const text = props.shape.text || {}
  return {
    ...textStyleCss(text.style, text.valign, text.align),
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    overflow: 'hidden',
    // Wrap inside the shape and break over-long words, so committed text never
    // spills horizontally past the box (G3). wordBreak is inherited by the inner
    // <p>, so the rendered label matches how it wrapped while editing.
    //
    // A canvas text element is the exception (#418): its box was grown to the
    // measured width of the unwrapped text, so wrapping it here would re-flow the
    // committed label into something the editor never showed.
    ...(fitsWidthToText(props.shape)
      ? { whiteSpace: 'pre' }
      : { whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word' }),
    opacity: props.shape.opacity ?? 1,
  }
})

const center = computed(() => ({
  x: props.shape.x + props.shape.w / 2,
  y: props.shape.y + props.shape.h / 2,
}))

// Flip mirrors the shape's own content (triangle apex, arrow direction, image,
// text) in its local frame, applied *before* rotation swings the whole thing
// around — so it composes correctly with a rotated shape without touching the
// rotation angle (Transform section, D10). SVG applies the rightmost transform
// first, so the mirror (translate/scale/translate) sits to the right of rotate.
const transform = computed(() => {
  const { flipX, flipY } = props.shape
  // Mind-map / flowchart nodes never rotate (#7): they auto-size to text and offer
  // add-node CTAs instead of a rotation knob, so ignore any stored angle on render.
  const roleIsNode = props.shape.role === 'mindmap-node' || props.shape.role === 'flowchart-node'
  const rotation = roleIsNode ? 0 : props.shape.rotation
  const parts = []
  if (rotation) parts.push(`rotate(${rotation} ${center.value.x} ${center.value.y})`)
  if (flipX || flipY) {
    parts.push(
      `translate(${center.value.x} ${center.value.y})`,
      `scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`,
      `translate(${-center.value.x} ${-center.value.y})`,
    )
  }
  return parts.length ? parts.join(' ') : null
})

// Corner radius for the rect branch, from the shared helper so the draw preview
// (which ghosts through this same component) renders identical corners (#130).
const cornerRadius = computed(() => {
  // A mind-map node's corner roundness follows its own curve setting (#260); every
  // other shape uses the shared box radius. isMindmapNode is declared below — safe
  // here because the getter only runs at render time (same TDZ pattern as autofit).
  const curve = props.shape.mindmap?.curve
  if (isMindmapNode.value && curve) return curveRadius(curve)
  return shapeCornerRadius(props.shape.type, props.shape.cornerRadius)
})

const border = computed(() => props.shape.border || {})
const dashArray = computed(() => {
  const w = border.value.width || 1
  if (border.value.dash === 'dashed') return `${w * 3} ${w * 2}`
  if (border.value.dash === 'dotted') return `${w} ${w * 2}`
  return null
})

// Triangle and diamond are polygons described by their bounding box corners.
const trianglePoints = computed(() => {
  const { x, y, w, h } = props.shape
  return `${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`
})

const diamondPoints = computed(() => {
  const { x, y, w, h } = props.shape
  return `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`
})

// Polygon shapes described by normalized (0..1) points scaled to the box.
const POLYGONS = {
  pentagon: [[0.5, 0], [1, 0.38], [0.82, 1], [0.18, 1], [0, 0.38]],
  hexagon: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  arrow: [[0, 0.3], [0.62, 0.3], [0.62, 0.05], [1, 0.5], [0.62, 0.95], [0.62, 0.7], [0, 0.7]],
}
function scale(points) {
  const { x, y, w, h } = props.shape
  return points.map(([nx, ny]) => `${x + nx * w},${y + ny * h}`).join(' ')
}
const polygonPoints = computed(() => (POLYGONS[props.shape.type] ? scale(POLYGONS[props.shape.type]) : ''))

// A freely-drawn polygon (#139) carries its own vertices, normalised to the box —
// so it scales, moves and rotates through x/y/w/h like every other shape.
const freePolygonPoints = computed(() => polygonPointsString(props.shape))

// Five-pointed star generated around the box centre.
const starPoints = computed(() => {
  const { x, y, w, h } = props.shape
  const cx = x + w / 2
  const cy = y + h / 2
  const pts = []
  for (let i = 0; i < 10; i += 1) {
    const angle = (-90 + i * 36) * (Math.PI / 180)
    const rx = (i % 2 ? 0.2 : 0.5) * w
    const ry = (i % 2 ? 0.2 : 0.5) * h
    pts.push(`${cx + rx * Math.cos(angle)},${cy + ry * Math.sin(angle)}`)
  }
  return pts.join(' ')
})

// Cylinder: a body path; the top rim ellipse is drawn separately for the lid.
const cylinderRy = computed(() => Math.min(props.shape.h * 0.16, 18))
const cylinderBody = computed(() => {
  const { x, y, w, h } = props.shape
  const ry = cylinderRy.value
  return `M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} L ${x + w} ${y + h - ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z`
})

// Callout: a rounded body with a small tail at the bottom-left.
const calloutPath = computed(() => {
  const { x, y, w, h } = props.shape
  const bodyH = h * 0.78
  const r = Math.min(14, bodyH / 2, w / 2)
  return (
    `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + bodyH - r} ` +
    `Q ${x + w} ${y + bodyH} ${x + w - r} ${y + bodyH} H ${x + w * 0.34} L ${x + w * 0.2} ${y + h} ` +
    `L ${x + w * 0.22} ${y + bodyH} H ${x + r} Q ${x} ${y + bodyH} ${x} ${y + bodyH - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
  )
})

const fill = computed(() => props.shape.fill || 'none')
const textStyle = computed(() => props.shape.text?.style || {})

// A migrated flowchart node (free-floating refactor #122) carries its original
// node type in `flowchart.nodeType`. Draw the exact flowchart glyph — stadium /
// parallelogram / document / cylinder / … — via the same geometry FlowchartLayer
// uses, so a flattened flowchart is pixel-identical to the framed one. Geometry
// is local to the node box, so the template renders it inside a translate group.
// Plain block shapes have no flowchart tag and fall through to the type branches.
const flowchartGlyph = computed(() => {
  const nodeType = props.shape.flowchart?.nodeType
  return nodeType ? nodeShape(nodeType, props.shape.w, props.shape.h) : null
})

// A free-floating mind-map node (unified canvas). Its label edits on a single
// click and its cursor changes by hover zone (#123); both key off this.
const isMindmapNode = computed(() => props.shape.role === 'mindmap-node')

// Whimsical mind map (#125): a non-root node with `mindmap.shaped === false`
// renders as transparent text — no rect / fill / border, just its label. The
// root stays a box (shaped is true). Only the box branch keys off this; the
// shape keeps its w/h, so selection and marquee still target its bounding box.
const mindmapAsText = computed(
  () => props.shape.role === 'mindmap-node' && props.shape.mindmap?.shaped === false,
)

// Any empty mind-map node (boxed or text) shows a muted "New idea" placeholder so
// a blank — especially boxless — node is still visible and selectable. It is
// render-only: never written back as text content.
const mindmapPlaceholder = computed(
  () => props.shape.role === 'mindmap-node' && !props.shape.text?.content,
)

// Label colour for the centred <text>. A boxless text node needs dark ink on the
// white canvas (or its own mindmap.color for Whimsical coloured text); a boxed
// node keeps its stored text colour; an empty node draws the muted placeholder.
const labelFill = computed(() => {
  if (mindmapPlaceholder.value) return '#9CA3AF'
  if (mindmapAsText.value) return props.shape.mindmap?.color || '#1F2933'
  return textStyle.value.color
})

// Shrink-to-fit the rich text when the shape opts in (spec 6.4). Declared last so
// the inputs getter can reference the computeds above without hitting the TDZ.
useAutoFitText(richEl, () => ({
  enabled: props.shape.text?.autoFit && !isEditingThis.value,
  base: props.shape.text?.style?.size || 16,
  w: textArea.value?.w,
  h: textArea.value?.h,
  html: richHtml.value,
}))
</script>

<template>
  <g :transform="transform" :data-shape-id="shape.id">
    <!-- Migrated flowchart node: render its exact glyph (see flowchartGlyph). The
         node box geometry is local, so translate into place; the shared text /
         link blocks below still draw in absolute coords. -->
    <g v-if="flowchartGlyph" :transform="`translate(${shape.x} ${shape.y})`">
      <rect
        v-if="flowchartGlyph.kind === 'rect'"
        x="0"
        y="0"
        :width="shape.w"
        :height="shape.h"
        :rx="flowchartGlyph.rx"
        :fill="fill"
        :fill-opacity="shape.opacity"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
      <ellipse
        v-else-if="flowchartGlyph.kind === 'ellipse'"
        :cx="shape.w / 2"
        :cy="shape.h / 2"
        :rx="shape.w / 2"
        :ry="shape.h / 2"
        :fill="fill"
        :fill-opacity="shape.opacity"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
      <polygon
        v-else-if="flowchartGlyph.kind === 'polygon'"
        :points="flowchartGlyph.points"
        :fill="fill"
        :fill-opacity="shape.opacity"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
      <path
        v-else-if="flowchartGlyph.kind === 'path'"
        :d="flowchartGlyph.d"
        :fill="fill"
        :fill-opacity="shape.opacity"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
    </g>
    <rect
      v-else-if="(shape.type === 'rectangle' || shape.type === 'square' || shape.type === 'rounded') && !mindmapAsText"
      :x="shape.x"
      :y="shape.y"
      :width="shape.w"
      :height="shape.h"
      :rx="cornerRadius"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <ellipse
      v-else-if="shape.type === 'ellipse'"
      :cx="center.x"
      :cy="center.y"
      :rx="shape.w / 2"
      :ry="shape.h / 2"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'triangle'"
      :points="trianglePoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'diamond'"
      :points="diamondPoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'pentagon' || shape.type === 'hexagon' || shape.type === 'arrow'"
      :points="polygonPoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'polygon'"
      :points="freePolygonPoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <polygon
      v-else-if="shape.type === 'star'"
      :points="starPoints"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <g v-else-if="shape.type === 'cylinder'">
      <path
        :d="cylinderBody"
        :fill="fill"
        :fill-opacity="shape.opacity"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
      <path
        :d="`M ${shape.x} ${shape.y + cylinderRy} A ${shape.w / 2} ${cylinderRy} 0 0 1 ${shape.x + shape.w} ${shape.y + cylinderRy}`"
        fill="none"
        :stroke="border.color"
        :stroke-width="border.width"
        :stroke-dasharray="dashArray"
      />
    </g>
    <path
      v-else-if="shape.type === 'callout'"
      :d="calloutPath"
      :fill="fill"
      :fill-opacity="shape.opacity"
      :stroke="border.color"
      :stroke-width="border.width"
      :stroke-dasharray="dashArray"
    />
    <image
      v-else-if="shape.type === 'image' && safeSrc"
      :href="safeSrc"
      :x="shape.x"
      :y="shape.y"
      :width="shape.w"
      :height="shape.h"
      :opacity="shape.opacity"
      preserveAspectRatio="xMidYMid meet"
    />

    <!-- Mind-map node hover/cursor zones (#123). The rim (full bbox, underneath)
         shows an arrow — a click there selects; the inset label zone (on top)
         shows an I-beam — a single click there edits. Transparent and cursor-only:
         DiagramCanvas owns the gesture and decides the action from the SAME
         NODE_BORDER_ZONE threshold, so the cursor and the click can't disagree.
         Rendered above the body but below the link badge, and the label text is
         non-capturing for these nodes, so the I-beam shows even over the glyphs. -->
    <template v-if="isMindmapNode">
      <rect
        :x="shape.x" :y="shape.y" :width="shape.w" :height="shape.h"
        fill="transparent" style="cursor: default"
      />
      <rect
        v-if="selected && shape.w > NODE_BORDER_ZONE * 2 && shape.h > NODE_BORDER_ZONE * 2"
        :x="shape.x + NODE_BORDER_ZONE" :y="shape.y + NODE_BORDER_ZONE"
        :width="shape.w - NODE_BORDER_ZONE * 2" :height="shape.h - NODE_BORDER_ZONE * 2"
        fill="transparent" style="cursor: text"
      />
    </template>

    <!-- Rich text (HTML) — hidden while this shape is being edited. -->
    <foreignObject
      v-if="!isEditingThis && richHtml"
      :x="textArea.x"
      :y="textArea.y"
      :width="textArea.w"
      :height="textArea.h"
      style="overflow: visible"
    >
      <div
        ref="richEl"
        class="fd-richtext"
        :data-fit-width="fitsWidthToText(shape) ? '' : undefined"
        :style="richStyle"
        v-html="richHtml"
      />
    </foreignObject>

    <!-- Hyperlink badge (spec 6.5): opens the shape's link in a new tab. Sits at
         the top-right corner; click is isolated so it never moves/deselects. -->
    <a
      v-if="safeLink"
      :href="safeLink"
      target="_blank"
      rel="noopener noreferrer"
      style="cursor: pointer"
      @pointerdown.stop
      @click.stop
    >
      <title>{{ safeLink }}</title>
      <circle :cx="shape.x + shape.w - 13" :cy="shape.y + 13" r="9" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />
      <!-- The lucide "link" glyph, inlined. This one badge sits INSIDE the canvas
           SVG, where an icon-font <span> has no layout box at all — so it is the
           one icon that cannot be a CSS class (#311). -->
      <svg
        :x="shape.x + shape.w - 18"
        :y="shape.y + 8"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-ink-gray-7"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </a>

    <!-- Legacy plain text (shapes with only a plain `content` string, no rich
         html). Must be its own v-if guarded by !richHtml: a shape with BOTH html
         and content (e.g. whiteboard text) would otherwise render the rich
         foreignObject AND this <text>, showing the text twice (Q2). The prior
         v-else-if chained to the hyperlink <a>, not the foreignObject. -->
    <text
      v-if="!isEditingThis && !richHtml && (shape.text?.content || mindmapPlaceholder)"
      :x="center.x"
      :y="center.y"
      text-anchor="middle"
      dominant-baseline="central"
      :fill="labelFill"
      :font-size="textStyle.size"
      :font-weight="textStyle.bold ? 700 : 500"
      :font-style="textStyle.italic ? 'italic' : 'normal'"
      :text-decoration="textStyle.underline ? 'underline' : 'none'"
      :opacity="shape.opacity"
      :font-family="textStyle.font || 'Inter, sans-serif'"
      :style="isMindmapNode ? { pointerEvents: 'none' } : null"
    >
      {{ mindmapPlaceholder ? 'New idea' : shape.text.content }}
    </text>
  </g>
</template>
