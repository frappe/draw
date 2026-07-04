<script setup>
// Whiteboard render layer (spec diagram-types Part C). The single render-to-SVG
// path for the type (Part G8): canvas, export, thumbnail and viewer all draw the
// same elements. Lives inside the canvas viewport <g>, so every coordinate is in
// canvas units (Part G4). Renders, bottom→top: shared connectors + base shapes,
// freehand strokes (pen/highlighter, optionally sketch-roughened), the live
// in-progress stroke, sticky notes (draggable/resizable, auto-contrast, link),
// and the transient laser trail (never persisted/exported, spec C5/C10/G8).
//
// This component also OWNS instantiating the whiteboard surface-interaction
// composable: it only mounts when the active type is whiteboard, has the store/
// editorUi/modeInteraction in scope via inject, and tears the handlers down on
// unmount. That keeps the wiring inside whiteboard-owned files (no shared-file
// edits) while still living for the whole time the board is on screen.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardInteraction } from '@/composables/useWhiteboardInteraction.js'
import { useWhiteboardUi, LASER_FADE_MS } from '@/composables/useWhiteboardUi.js'
import { roughenSegment, pointsToPath } from '@/diagram/sketch.js'
import { HIGHLIGHTER_OPACITY } from '@/diagram/whiteboardColors.js'
import { whiteboardObjectBoxes, voteFor } from '@/diagram/whiteboardModel.js'
import ConnectorView from './ConnectorView.vue'
import ShapeView from './ShapeView.vue'
import WhiteboardStickyNote from './WhiteboardStickyNote.vue'
import WhiteboardLine from './WhiteboardLine.vue'
import WhiteboardTable from './WhiteboardTable.vue'

const props = defineProps({
  whiteboard: { type: Object, required: true },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const ui = useWhiteboardUi()
useWhiteboardInteraction(store, editorUi)

const orderedShapes = computed(() =>
  [...store.state.shapes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
)

// SVG path `d` for a stroke. Highlighter and pen share the geometry; sketch mode
// roughens each segment into a hand-drawn wobble (spec C4). Width is in canvas
// units so it scales with zoom (spec C10).
function strokePath(stroke) {
  const points = stroke.points
  if (points.length < 2) return ''
  if (!props.whiteboard.sketchStyle) return pointsToPath(points)
  const wobbled = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const segment = roughenSegment(points[i], points[i + 1], Math.max(1, stroke.width * 0.4), i + 1)
    wobbled.push(...(i === 0 ? segment : segment.slice(1)))
  }
  return pointsToPath(wobbled)
}

function strokeOpacity(stroke) {
  return stroke.kind === 'highlighter' ? HIGHLIGHTER_OPACITY : 1
}

// Highlight EVERY selected object (multi-select), not just a lone selection.
function isSelected(kind, id) {
  return ui.isSelected(kind, id)
}
function isSelectedStroke(id) {
  return isSelected('stroke', id)
}

// Marquee stroke scales inversely with zoom so it reads at any scale (like the
// flowchart marquee). Rendered inside the viewport <g>, so box is in canvas units.
const zoom = computed(() => editorUi.viewport.state.zoom)

const live = computed(() => ui.liveStroke.value)
const livePath = computed(() => (live.value ? strokePath(live.value) : ''))
const liveLine = computed(() => ui.liveLine.value)

// Empty-state hint (spec C8/W6): a faint center prompt while the board has no
// strokes, stickies, or base shapes. Placed near the canvas origin/center.
const isEmpty = computed(
  () =>
    !props.whiteboard.strokes.length &&
    !props.whiteboard.stickyNotes.length &&
    !(props.whiteboard.lines || []).length &&
    !(props.whiteboard.tables || []).length &&
    !store.state.shapes.length,
)
const hintCenter = computed(() => ({
  x: (store.state.canvas.width || 1280) / 2,
  y: (store.state.canvas.height || 720) / 2,
}))

// Per-object vote badges (T3): a small pill at each voted object's top-right
// showing 👍/👎 tallies, chat-reaction style. Image shapes vote too, so their
// boxes are unioned in alongside the whiteboard objects.
const voteBadges = computed(() => {
  const votes = props.whiteboard.votes || {}
  const boxes = [
    ...whiteboardObjectBoxes(props.whiteboard),
    ...store.state.shapes.map((s) => ({ kind: 'shape', id: s.id, box: { x: s.x, y: s.y, w: s.w, h: s.h } })),
  ]
  const out = []
  for (const o of boxes) {
    const v = votes[`${o.kind}:${o.id}`]
    if (!v || (!v.up && !v.down)) continue
    out.push({ key: `${o.kind}:${o.id}`, x: o.box.x + o.box.w - 6, y: o.box.y + 4, up: v.up || 0, down: v.down || 0 })
  }
  return out
})

// Laser trail rendered as fading dots (spec C5). Newer points are more opaque;
// the dot shrinks with age. Pure render of transient state — never exported.
const laserDots = computed(() => {
  const now = performance.now()
  return ui.laserTrail.value.map((point) => {
    const age = (now - point.at) / LASER_FADE_MS
    return { x: point.x, y: point.y, opacity: Math.max(0, 1 - age) }
  })
})
</script>

<template>
  <g>
    <!-- Empty-state hint (spec C8). -->
    <text
      v-if="isEmpty"
      :x="hintCenter.x"
      :y="hintCenter.y"
      text-anchor="middle"
      font-size="18"
      fill="#9AA5B1"
      style="font-family: Inter, sans-serif; pointer-events: none"
    >
      Double-click to type · pick a tool below to draw, add lines, tables or sticky notes
    </text>

    <!-- Shared base shapes + connectors live in the common arrays (spec C9). -->
    <ConnectorView
      v-for="connector in store.state.connectors"
      :key="connector.id"
      :connector="connector"
    />
    <ShapeView v-for="shape in orderedShapes" :key="shape.id" :shape="shape" />

    <!-- Committed freehand strokes. -->
    <path
      v-for="stroke in whiteboard.strokes"
      :key="stroke.id"
      :d="strokePath(stroke)"
      fill="none"
      :stroke="stroke.color"
      :stroke-width="stroke.width"
      :stroke-opacity="strokeOpacity(stroke)"
      :stroke-linecap="stroke.kind === 'highlighter' ? 'butt' : 'round'"
      stroke-linejoin="round"
      :style="isSelectedStroke(stroke.id) ? 'outline: none; filter: drop-shadow(0 0 2px #006EDB)' : null"
    />

    <!-- Live stroke being drawn (before RDP simplify + commit). -->
    <path
      v-if="live && livePath"
      :d="livePath"
      fill="none"
      :stroke="live.color"
      :stroke-width="live.width"
      :stroke-opacity="live.kind === 'highlighter' ? HIGHLIGHTER_OPACITY : 1"
      :stroke-linecap="live.kind === 'highlighter' ? 'butt' : 'round'"
      stroke-linejoin="round"
    />

    <!-- Straight lines with endpoints (none/arrow/dot). -->
    <WhiteboardLine
      v-for="line in whiteboard.lines || []"
      :key="line.id"
      :line="line"
      :selected="isSelected('line', line.id)"
    />

    <!-- Live line being dragged (before commit). -->
    <WhiteboardLine v-if="liveLine" :line="liveLine" />

    <!-- Tables (grid + per-cell text + inline editor). -->
    <WhiteboardTable
      v-for="table in whiteboard.tables || []"
      :key="table.id"
      :table="table"
      :selected="isSelected('table', table.id)"
    />

    <!-- Sticky notes (each owns its drag/resize/edit/link). -->
    <WhiteboardStickyNote
      v-for="note in whiteboard.stickyNotes"
      :key="note.id"
      :note="note"
      :sketch="whiteboard.sketchStyle"
    />

    <!-- Per-object vote badges (T3): a small pill tallying 👍/👎, top-right of the
         object. Non-interactive — votes are cast from the object's edit menu. -->
    <g
      v-for="badge in voteBadges"
      :key="badge.key"
      :transform="`translate(${badge.x} ${badge.y})`"
      style="pointer-events: none"
    >
      <rect x="-1" y="0" rx="8" height="18" :width="badge.up && badge.down ? 62 : 38"
        fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" />
      <text v-if="badge.up" x="6" y="9" dominant-baseline="central" font-size="11"
        style="font-family: Inter, sans-serif">👍 {{ badge.up }}</text>
      <text v-if="badge.down" :x="badge.up ? 34 : 6" y="9" dominant-baseline="central" font-size="11"
        style="font-family: Inter, sans-serif">👎 {{ badge.down }}</text>
    </g>

    <!-- Self-fading laser trail (transient; never persisted or exported). -->
    <circle
      v-for="(dot, index) in laserDots"
      :key="index"
      :cx="dot.x"
      :cy="dot.y"
      :r="5"
      fill="#E03636"
      :fill-opacity="dot.opacity * 0.8"
    />

    <!-- Live rubber-band marquee while dragging empty canvas (logical units). -->
    <rect
      v-if="ui.state.marquee"
      :x="ui.state.marquee.x"
      :y="ui.state.marquee.y"
      :width="ui.state.marquee.w"
      :height="ui.state.marquee.h"
      fill="rgba(79,148,255,0.08)"
      stroke="#4F94FF"
      :stroke-width="1 / zoom"
      :stroke-dasharray="`${4 / zoom} ${3 / zoom}`"
    />
  </g>
</template>
