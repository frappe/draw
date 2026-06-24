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
import ConnectorView from './ConnectorView.vue'
import ShapeView from './ShapeView.vue'
import WhiteboardStickyNote from './WhiteboardStickyNote.vue'

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

function isSelectedStroke(id) {
  return ui.state.selected?.kind === 'stroke' && ui.state.selected.id === id
}

const live = computed(() => ui.liveStroke.value)
const livePath = computed(() => (live.value ? strokePath(live.value) : ''))

// Empty-state hint (spec C8/W6): a faint center prompt while the board has no
// strokes, stickies, or base shapes. Placed near the canvas origin/center.
const isEmpty = computed(
  () =>
    !props.whiteboard.strokes.length &&
    !props.whiteboard.stickyNotes.length &&
    !store.state.shapes.length,
)
const hintCenter = computed(() => ({
  x: (store.state.canvas.width || 1280) / 2,
  y: (store.state.canvas.height || 720) / 2,
}))

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
      Double-click to type · pick the pen to draw · drop a sticky note
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

    <!-- Sticky notes (each owns its drag/resize/edit/link). -->
    <WhiteboardStickyNote
      v-for="note in whiteboard.stickyNotes"
      :key="note.id"
      :note="note"
      :sketch="whiteboard.sketchStyle"
    />

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
  </g>
</template>
