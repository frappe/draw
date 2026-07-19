<script setup>
// Floating minimap / navigator for block, flowchart and mind-map diagrams
// (spec 1.1). Whiteboard has its own (WhiteboardMinimap) in its palette, so this
// is shown for the other types. It draws a simplified vector overview (one rect
// per shape/node — cheap, updates live, no rasterization) plus a rectangle for
// the current viewport; click or drag to pan there through the shared viewport.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { axisAlignedBBox } from '@/diagram/geometry.js'
import { isVisible } from '@/diagram/shapeFlags.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { resolveNodeColor, nodeFill } from '@/diagram/mindmapColors.js'
import { isRoot as isMindRoot } from '@/diagram/mindmapModel.js'
import { nodeSize as flowchartNodeSize } from '@/diagram/flowchartModel.js'
import { whiteboardObjectBoxes } from '@/diagram/whiteboardModel.js'
import { isUnifiedDocument } from '@/diagram/schema.js'

const store = useDiagramStore()
const editorUi = useEditorUi()
const viewport = editorUi.viewport
const modeStrategy = useModeStrategy()

const WIDTH = 180
const HEIGHT = 120
const PAD = 24

const type = computed(() => modeStrategy.value.type)
// The whiteboard has its own navigator; every other type shows this one, even
// when empty, so the mini-navigator is always available (S4/B2/N15).
const shown = computed(() => type.value !== 'whiteboard')

// Live surface pixel size (for the viewport rectangle).
const surfaceSize = ref({ w: 0, h: 0 })
function measureSurface() {
  const el = document.querySelector('[data-fdpreset]')
  if (el) {
    const rect = el.getBoundingClientRect()
    surfaceSize.value = { w: rect.width, h: rect.height }
  }
}
let onResize = null
onMounted(() => {
  measureSurface()
  onResize = () => measureSurface()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

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

// Simplified content shapes in canvas units, per diagram type. Each carries its
// real `fill`, an optional `stroke`, and a `kind` the template renders — so the
// overview looks like the diagram (colours + shapes), not flat grey boxes.
const items = computed(() => {
  // Unified canvas: overview ALL content — block shapes + whiteboard objects +
  // the mind-map / flowchart frames (offset by their origin).
  if (isUnifiedDocument(store.state)) {
    const out = []
    for (const s of store.state.shapes.filter(isVisible)) {
      const b = axisAlignedBBox(s)
      out.push({
        id: `s-${s.id}`, x: b.x, y: b.y, w: b.w, h: b.h,
        fill: s.fill && s.fill !== 'none' ? s.fill : '#CBD5E1',
        stroke: s.border?.color || null, kind: miniKind(s.type),
      })
    }
    const wb = store.state.whiteboard
    if (wb) {
      for (const o of whiteboardObjectBoxes(wb)) {
        out.push({ id: `w-${o.id}`, ...o.box, fill: '#E2E8F0', stroke: '#94A3B8', kind: 'rect' })
      }
    }
    const mm = store.state.mindmap
    if (mm?.nodes?.length) {
      const { positions } = layoutMindMap(mm)
      const o = mm.origin || { x: 0, y: 0 }
      for (const n of mm.nodes) {
        const b = positions[n.id]
        if (b) out.push({ id: `m-${n.id}`, x: b.x + o.x, y: b.y + o.y, w: b.w, h: b.h, fill: '#F3F3F3', stroke: '#CBD5E1', kind: 'rounded' })
      }
    }
    const fc = store.state.flowchart
    if (fc?.nodes?.length) {
      const o = fc.origin || { x: 0, y: 0 }
      for (const n of fc.nodes) {
        const s = flowchartNodeSize(n)
        out.push({ id: `f-${n.id}`, x: n.x + o.x, y: n.y + o.y, w: s.w, h: s.h, fill: n.fill && n.fill !== 'none' ? n.fill : '#EEF2F7', stroke: '#94A3B8', kind: 'rect' })
      }
    }
    return out
  }
  if (type.value === 'flowchart' && store.state.flowchart) {
    return store.state.flowchart.nodes.map((n) => {
      const s = flowchartNodeSize(n)
      return {
        id: n.id, x: n.x, y: n.y, w: s.w, h: s.h,
        fill: n.fill || '#EEF2F7', stroke: n.border || '#94A3B8',
        kind: n.nodeType === 'decision' ? 'diamond' : n.nodeType === 'connector' ? 'ellipse' : 'rect',
      }
    })
  }
  if (type.value === 'mindmap' && store.state.mindmap) {
    const model = store.state.mindmap
    const preset = store.state.themePreset
    const { positions } = layoutMindMap(model)
    return model.nodes
      .filter((n) => positions[n.id])
      .map((n) => {
        const b = positions[n.id]
        const color = resolveNodeColor(model, n, preset)
        const fill = n.fill || (n.color ? nodeFill(n.color) : isMindRoot(model, n.id) ? '#F3F3F3' : nodeFill(color))
        return { id: n.id, x: b.x, y: b.y, w: b.w, h: b.h, fill, stroke: n.border || color, kind: miniMindShape(n.shape) }
      })
  }
  return store.state.shapes
    .filter(isVisible)
    .map((s) => {
      const b = axisAlignedBBox(s)
      return {
        id: s.id, x: b.x, y: b.y, w: b.w, h: b.h,
        fill: s.fill && s.fill !== 'none' ? s.fill : '#CBD5E1',
        stroke: s.border?.color || null,
        kind: miniKind(s.type),
      }
    })
})

// Connector/branch lines in canvas units so the overview shows structure, not
// just scattered nodes: mind-map branches (in their branch colour), flowchart
// edges and block connectors (neutral). Center-to-center is enough at this size.
const links = computed(() => {
  if (type.value === 'mindmap' && store.state.mindmap) {
    const model = store.state.mindmap
    const preset = store.state.themePreset
    const { positions } = layoutMindMap(model)
    return model.nodes
      .filter((n) => n.parentId && positions[n.parentId] && positions[n.id])
      .map((n) => {
        const a = positions[n.parentId]
        const b = positions[n.id]
        return { id: n.id, x1: a.x + a.w / 2, y1: a.y + a.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2, color: resolveNodeColor(model, n, preset) }
      })
  }
  if (type.value === 'flowchart' && store.state.flowchart) {
    const byId = Object.fromEntries(store.state.flowchart.nodes.map((n) => [n.id, n]))
    return store.state.flowchart.edges
      .map((e) => {
        const a = byId[e.from.nodeId]
        const b = byId[e.to.nodeId]
        if (!a || !b) return null
        const sa = flowchartNodeSize(a)
        const sb = flowchartNodeSize(b)
        return { id: e.id, x1: a.x + sa.w / 2, y1: a.y + sa.h / 2, x2: b.x + sb.w / 2, y2: b.y + sb.h / 2, color: '#94A3B8' }
      })
      .filter(Boolean)
  }
  return []
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
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX - PAD, y: minY - PAD, w: Math.max(1, Math.max(...xs) - minX + PAD * 2), h: Math.max(1, Math.max(...ys) - minY + PAD * 2) }
})

const scale = computed(() => Math.min(WIDTH / frame.value.w, HEIGHT / frame.value.h))

function toMini(x, y) {
  return { x: (x - frame.value.x) * scale.value, y: (y - frame.value.y) * scale.value }
}

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

// Current viewport mapped into the minimap, clamped to the minimap box. Always
// shown (the blue "what you can see now" boundary) — a consistent navigator cue
// across every diagram type, matching the whiteboard minimap.
const viewRect = computed(() => {
  const zoom = viewport.state.zoom || 1
  const a = toMini(-viewport.state.panX / zoom, -viewport.state.panY / zoom)
  const right = a.x + (surfaceSize.value.w / zoom) * scale.value
  const bottom = a.y + (surfaceSize.value.h / zoom) * scale.value
  const x1 = Math.max(0, a.x)
  const y1 = Math.max(0, a.y)
  return { x: x1, y: y1, w: Math.max(0, Math.min(WIDTH, right) - x1), h: Math.max(0, Math.min(HEIGHT, bottom) - y1) }
})

// Click/drag pans so the picked content point centres in the viewport.
function panTo(event) {
  measureSurface()
  const rect = event.currentTarget.getBoundingClientRect()
  const canvasX = frame.value.x + (event.clientX - rect.left) / scale.value
  const canvasY = frame.value.y + (event.clientY - rect.top) / scale.value
  const zoom = viewport.state.zoom || 1
  viewport.setPan(surfaceSize.value.w / 2 - canvasX * zoom, surfaceSize.value.h / 2 - canvasY * zoom)
}

const dragging = ref(false)
function onDown(event) {
  dragging.value = true
  panTo(event)
}
function onMove(event) {
  if (dragging.value) panTo(event)
}
function onUp() {
  dragging.value = false
}
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
          Add a shape from the toolbar below
        </text>
      </template>
    </svg>
  </div>
</template>
