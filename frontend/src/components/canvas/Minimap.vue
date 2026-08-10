<script setup>
// Floating minimap / navigator for block, flowchart and mind-map diagrams
// (spec 1.1). Whiteboard has its own (WhiteboardMinimap) in its palette, so this
// is shown for the other types. It draws a simplified vector overview (one rect
// per shape/node — cheap, updates live, no rasterization) plus a rectangle for
// the current viewport; click or drag to pan there through the shared viewport.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { axisAlignedBBox, maxOf, minOf } from '@/diagram/geometry.js'
import { isVisible } from '@/diagram/shapeFlags.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { resolveNodeColor, nodeFill } from '@/diagram/mindmapColors.js'
import { isRoot as isMindRoot } from '@/diagram/mindmapModel.js'
import { nodeSize as flowchartNodeSize } from '@/diagram/flowchartModel.js'
import { whiteboardObjectBoxes } from '@/diagram/whiteboardModel.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { useMinimapNavigator, WIDTH, HEIGHT } from '@/composables/useMinimapNavigator.js'

const store = useDiagramStore()
const modeStrategy = useModeStrategy()

const PAD = 24

const type = computed(() => modeStrategy.value.type)
// The whiteboard has its own navigator; every other type shows this one, even
// when empty, so the mini-navigator is always available (S4/B2/N15).
const shown = computed(() => type.value !== 'whiteboard')

// Which simplified glyph the minimap draws for a block shape type, so the
// overview reflects the actual shape (an oval reads as an oval, not a box).
function miniKind(shapeType) {
  if (shapeType === 'ellipse') return 'ellipse'
  if (shapeType === 'triangle') return 'triangle'
  if (shapeType === 'diamond') return 'diamond'
  if (shapeType === 'text') return 'text'
  return 'rect'
}

// Map a mind-map node's chosen shape to a minimap glyph kind.
function miniMindShape(shape) {
  if (shape === 'ellipse') return 'ellipse'
  if (shape === 'diamond' || shape === 'hexagon') return 'diamond'
  return 'rect' // pill / rounded / rectangle all read as a rounded rect here
}

// Per-type builders shared by the unified overview and each dedicated type, so
// the mind-map / flowchart overview reflects real shapes + colours everywhere —
// including on the unified canvas, where they used to collapse to grey rects
// (#101). `ox/oy` fold in a frame's origin on the unified canvas.
function blockItems(shapes) {
  return shapes.filter(isVisible).map((s) => {
    const b = axisAlignedBBox(s)
    return {
      id: `s-${s.id}`, x: b.x, y: b.y, w: b.w, h: b.h,
      fill: s.fill && s.fill !== 'none' ? s.fill : '#CBD5E1',
      stroke: s.border?.color || null, kind: miniKind(s.type),
    }
  })
}
function flowchartItems(fc, ox = 0, oy = 0) {
  return fc.nodes.map((n) => {
    const s = flowchartNodeSize(n)
    return {
      id: `f-${n.id}`, x: n.x + ox, y: n.y + oy, w: s.w, h: s.h,
      fill: n.fill && n.fill !== 'none' ? n.fill : '#EEF2F7', stroke: n.border || '#94A3B8',
      kind: n.nodeType === 'decision' ? 'diamond' : n.nodeType === 'connector' ? 'ellipse' : 'rect',
    }
  })
}
function mindmapItems(mm, preset, ox = 0, oy = 0) {
  const { positions } = layoutMindMap(mm)
  return mm.nodes
    .filter((n) => positions[n.id])
    .map((n) => {
      const b = positions[n.id]
      const color = resolveNodeColor(mm, n, preset)
      const fill = n.fill || (n.color ? nodeFill(n.color) : isMindRoot(mm, n.id) ? '#F3F3F3' : nodeFill(color))
      return { id: `m-${n.id}`, x: b.x + ox, y: b.y + oy, w: b.w, h: b.h, fill, stroke: n.border || color, kind: miniMindShape(n.shape) }
    })
}
function flowchartLinks(fc, ox = 0, oy = 0) {
  const byId = Object.fromEntries(fc.nodes.map((n) => [n.id, n]))
  return fc.edges
    .map((e) => {
      const a = byId[e.from.nodeId]
      const b = byId[e.to.nodeId]
      if (!a || !b) return null
      const sa = flowchartNodeSize(a)
      const sb = flowchartNodeSize(b)
      return { id: `fl-${e.id}`, x1: a.x + ox + sa.w / 2, y1: a.y + oy + sa.h / 2, x2: b.x + ox + sb.w / 2, y2: b.y + oy + sb.h / 2, color: '#94A3B8' }
    })
    .filter(Boolean)
}
function mindmapLinks(mm, preset, ox = 0, oy = 0) {
  const { positions } = layoutMindMap(mm)
  return mm.nodes
    .filter((n) => n.parentId && positions[n.parentId] && positions[n.id])
    .map((n) => {
      const a = positions[n.parentId]
      const b = positions[n.id]
      return { id: `ml-${n.id}`, x1: a.x + ox + a.w / 2, y1: a.y + oy + a.h / 2, x2: b.x + ox + b.w / 2, y2: b.y + oy + b.h / 2, color: resolveNodeColor(mm, n, preset) }
    })
}
function originOf(model) {
  const o = model.origin || { x: 0, y: 0 }
  return [o.x || 0, o.y || 0]
}
// Shared connectors[] as overview links (center-to-center, like the sub-model
// link builders). Attached ends resolve to their shape's centre; a connector to
// a missing/absent shape is dropped rather than drawn as a dangling line. This is
// how migrated mind-map branches / flowchart edges (free-floating #122) show in
// the overview once they live in connectors[]; it also surfaces plain block
// connectors, which the minimap did not draw before.
function connectorLinks(connectors, shapes) {
  const byId = Object.fromEntries(shapes.map((s) => [s.id, s]))
  return (connectors || [])
    .map((c) => {
      const a = connectorEnd(c.from, byId)
      const b = connectorEnd(c.to, byId)
      if (!a || !b) return null
      return { id: `c-${c.id}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: c.style?.color || '#94A3B8' }
    })
    .filter(Boolean)
}
function connectorEnd(endpoint, byId) {
  if (endpoint?.shapeId) {
    const shape = byId[endpoint.shapeId]
    if (!shape) return null
    const b = axisAlignedBBox(shape)
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }
  if (Number.isFinite(endpoint?.x) && Number.isFinite(endpoint?.y)) return { x: endpoint.x, y: endpoint.y }
  return null
}

// Simplified content shapes in canvas units. Each carries its real fill, an
// optional stroke, and a `kind` the template renders — so the overview looks like
// the diagram (colours + shapes), not flat grey boxes.
const items = computed(() => {
  const preset = store.state.themePreset
  const { mindmap: mm, flowchart: fc, whiteboard: wb } = store.state
  // Unified canvas: overview ALL content — block shapes + whiteboard objects +
  // the mind-map / flowchart frames (offset by their origin).
  if (isUnifiedDocument(store.state)) {
    const out = blockItems(store.state.shapes)
    if (wb) for (const o of whiteboardObjectBoxes(wb)) out.push({ id: `w-${o.id}`, ...o.box, fill: '#E2E8F0', stroke: '#94A3B8', kind: 'rect' })
    if (mm?.nodes?.length) out.push(...mindmapItems(mm, preset, ...originOf(mm)))
    if (fc?.nodes?.length) out.push(...flowchartItems(fc, ...originOf(fc)))
    return out
  }
  if (type.value === 'flowchart' && fc) return flowchartItems(fc)
  if (type.value === 'mindmap' && mm) return mindmapItems(mm, preset)
  return blockItems(store.state.shapes)
})

// Connector/branch lines in canvas units so the overview shows structure, not
// just scattered nodes: mind-map branches (in their branch colour) and flowchart
// edges. Center-to-center is enough at this size.
const links = computed(() => {
  const preset = store.state.themePreset
  const { mindmap: mm, flowchart: fc } = store.state
  if (isUnifiedDocument(store.state)) {
    const out = connectorLinks(store.state.connectors, store.state.shapes)
    if (mm?.nodes?.length) out.push(...mindmapLinks(mm, preset, ...originOf(mm)))
    if (fc?.nodes?.length) out.push(...flowchartLinks(fc, ...originOf(fc)))
    return out
  }
  if (type.value === 'mindmap' && mm) return mindmapLinks(mm, preset)
  if (type.value === 'flowchart' && fc) return flowchartLinks(fc)
  return connectorLinks(store.state.connectors, store.state.shapes)
})

// Bounding frame over the content, with padding. The block canvas is infinite
// (spec 1.5) — the minimap frames the actual shapes, not a fixed paper rect, so
// no canvas boundary is implied.
const frame = computed(() => {
  const xs = []
  const ys = []
  for (const it of items.value) {
    xs.push(it.x, it.x + it.w)
    ys.push(it.y, it.y + it.h)
  }
  if (!xs.length) return { x: 0, y: 0, w: 1, h: 1 }
  const minX = minOf(xs)
  const minY = minOf(ys)
  return { x: minX - PAD, y: minY - PAD, w: Math.max(1, maxOf(xs) - minX + PAD * 2), h: Math.max(1, maxOf(ys) - minY + PAD * 2) }
})

// Fit/pan/drag mechanics (shared with WhiteboardMinimap). This navigator crops
// the viewport rect to its box, so it takes the clamped variant.
const {
  scale,
  toMini,
  clampedViewRect: viewRect,
  onDown,
  onMove,
  onUp,
} = useMinimapNavigator(frame)

const miniItems = computed(() =>
  items.value.map((it) => {
    const p = toMini(it.x, it.y)
    return { id: it.id, x: p.x, y: p.y, w: Math.max(1.5, it.w * scale.value), h: Math.max(1.5, it.h * scale.value), fill: it.fill, stroke: it.stroke, kind: it.kind }
  }),
)

const miniLinks = computed(() =>
  links.value.map((l) => {
    const a = toMini(l.x1, l.y1)
    const b = toMini(l.x2, l.y2)
    return { id: l.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: l.color }
  }),
)

</script>

<template>
  <div
    v-if="shown"
    class="absolute bottom-3 right-3 z-10 rounded-lg border border-outline-gray-2 bg-surface-base/95 p-1 shadow-md backdrop-blur"
    aria-label="Minimap"
  >
    <svg
      :width="WIDTH"
      :height="HEIGHT"
      class="rounded"
      style="cursor: pointer"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointerleave="onUp"
    >
      <!-- Connector / branch lines behind the nodes, so the overview reads as a
           connected diagram (mind-map branches keep their branch colour). -->
      <line
        v-for="l in miniLinks"
        :key="`l-${l.id}`"
        :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
        :stroke="l.color" stroke-width="1" stroke-linecap="round" opacity="0.7"
      />

      <!-- Simplified glyph per shape, so the overview reflects the real shape. -->
      <template v-for="it in miniItems" :key="it.id">
        <ellipse
          v-if="it.kind === 'ellipse'"
          :cx="it.x + it.w / 2"
          :cy="it.y + it.h / 2"
          :rx="it.w / 2"
          :ry="it.h / 2"
          :fill="it.fill"
          :stroke="it.stroke || 'none'"
          stroke-width="0.75"
        />
        <polygon
          v-else-if="it.kind === 'triangle'"
          :points="`${it.x + it.w / 2},${it.y} ${it.x + it.w},${it.y + it.h} ${it.x},${it.y + it.h}`"
          :fill="it.fill"
          :stroke="it.stroke || 'none'"
          stroke-width="0.75"
        />
        <polygon
          v-else-if="it.kind === 'diamond'"
          :points="`${it.x + it.w / 2},${it.y} ${it.x + it.w},${it.y + it.h / 2} ${it.x + it.w / 2},${it.y + it.h} ${it.x},${it.y + it.h / 2}`"
          :fill="it.fill"
          :stroke="it.stroke || 'none'"
          stroke-width="0.75"
        />
        <!-- Text box: two faint 'text lines' instead of a solid block, so it doesn't
             read as a filled rectangle in the overview. -->
        <g v-else-if="it.kind === 'text'">
          <line :x1="it.x" :y1="it.y + it.h * 0.38" :x2="it.x + it.w" :y2="it.y + it.h * 0.38" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" />
          <line :x1="it.x" :y1="it.y + it.h * 0.68" :x2="it.x + it.w * 0.6" :y2="it.y + it.h * 0.68" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" />
        </g>
        <rect
          v-else
          :x="it.x" :y="it.y" :width="it.w" :height="it.h"
          :fill="it.fill"
          :stroke="it.stroke || 'none'"
          stroke-width="0.75"
          :rx="Math.min(it.h / 2, 2)"
        />
      </template>

      <!-- Viewport indicator — only when zoomed into a subset of the content
           (null when everything's already in view, so no boundary is drawn). -->
      <rect
        v-if="miniItems.length && viewRect"
        :x="viewRect.x"
        :y="viewRect.y"
        :width="Math.max(4, viewRect.w)"
        :height="Math.max(4, viewRect.h)"
        fill="rgba(0,110,219,0.10)"
        stroke="#006EDB"
        stroke-width="1.5"
      />

      <!-- Empty state: a faint prompt toward the bottom toolbar. -->
      <template v-if="!miniItems.length">
        <text :x="WIDTH / 2" :y="HEIGHT / 2 - 5" text-anchor="middle" font-size="9" fill="#B0B7C0" style="font-family: Inter, sans-serif">
          Nothing to preview yet
        </text>
        <text :x="WIDTH / 2" :y="HEIGHT / 2 + 9" text-anchor="middle" font-size="9" fill="#B0B7C0" style="font-family: Inter, sans-serif">
          Add a shape from the toolbar above
        </text>
      </template>
    </svg>
  </div>
</template>
