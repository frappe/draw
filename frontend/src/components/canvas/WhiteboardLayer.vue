<script setup>
// Whiteboard render layer (spec diagram-types Part C). The single render-to-SVG
// path for the type (Part G8): canvas, export, thumbnail and viewer all draw the
// same elements. Lives inside the canvas viewport <g>, so every coordinate is in
// canvas units (Part G4). Renders, bottom→top: shared connectors, then every
// base shape and board object (strokes, lines, tables, sticky notes) in one
// zIndex-ordered pass, then the transient in-progress stroke/line, vote badges
// and laser trail (never persisted/exported, spec C5/C10/G8).
//
// This component also OWNS instantiating the whiteboard surface-interaction
// composable: it only mounts when the active type is whiteboard, has the store/
// editorUi/modeInteraction in scope via inject, and tears the handlers down on
// unmount. That keeps the wiring inside whiteboard-owned files (no shared-file
// edits) while still living for the whole time the board is on screen.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardInteraction } from '@/composables/useWhiteboardInteraction.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { LASER_COLOR, LASER_HEAD_RADIUS, LASER_FADE_MS } from '@/diagram/laser.js'
import { roughenSegment } from '@/diagram/sketch.js'
import { pointsToPath } from '@/diagram/svgPath.js'
import { HIGHLIGHTER_OPACITY } from '@/diagram/whiteboardColors.js'
import {
  whiteboardObjectBoxes,
  whiteboardObjectsInZOrder,
  isWhiteboardEmpty,
} from '@/diagram/whiteboardModel.js'
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

// Shapes and board objects paint as ONE z-ordered list (#27): a fixed
// shapes-then-strokes-then-stickies order put every newly inserted image behind
// existing freehand drawing and made Arrange look inert. Both pools share the
// zIndex scale, so a single sorted pass is all the ordering there is.
const orderedObjects = computed(() => [
  ...store.state.shapes
    .filter((shape) => !shape.hidden) // spec 7.4: hidden shapes leave the render list
    .map((shape) => ({ kind: 'shape', key: shape.id, object: shape })),
  ...whiteboardObjectsInZOrder(props.whiteboard).map((o) => ({
    kind: o.kind,
    key: `${o.kind}:${o.id}`,
    object: o.object,
  })),
].sort((a, b) => (a.object.zIndex || 0) - (b.object.zIndex || 0)))

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
// On the unified canvas the shared block layer renders the single empty-state, so
// suppress this whiteboard-specific prompt to avoid two overlapping hints.
const isEmpty = computed(
  () => isWhiteboardEmpty(props.whiteboard, store.state.shapes) && !isUnifiedDocument(store.state),
)
const hintCenter = computed(() => ({
  x: (store.state.canvas.width || 1280) / 2,
  y: (store.state.canvas.height || 720) / 2,
}))

// Per-object vote badges (T3): a small pill at each voted object's top-right
// showing 👍/👎 tallies, chat-reaction style. The common case is an empty vote
// map, so bail before scanning every object's geometry.
const voteBadges = computed(() => {
  const votes = props.whiteboard.votes || {}
  if (!Object.keys(votes).length) return []
  const out = []
  for (const o of whiteboardObjectBoxes(props.whiteboard)) {
    const v = votes[`${o.kind}:${o.id}`]
    if (!v || (!v.up && !v.down)) continue
    out.push({ key: `${o.kind}:${o.id}`, x: o.box.x + o.box.w - 6, y: o.box.y + 4, up: v.up || 0, down: v.down || 0 })
  }
  return out
})

// The laser dot: the newest trail point, fading on the laserClock so a resting
// pointer dims out instead of blinking off. Reading ui.laserClock makes this
// re-run on every animation frame the composable ticks. (The trail itself was
// dropped — just the dot now, #102.)
const laserHead = computed(() => {
  const points = ui.laserTrail.value
  if (!points.length) return null
  const now = ui.laserClock.value || performance.now()
  const point = points[points.length - 1]
  return { x: point.x, y: point.y, opacity: Math.max(0, 1 - (now - point.at) / LASER_FADE_MS) }
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
    <!-- Base shapes and board objects in one z-ordered pass, so anything added
         later sits on top and Arrange moves an object past any other (#27). -->
    <template v-for="item in orderedObjects" :key="item.key">
      <ShapeView v-if="item.kind === 'shape'" :shape="item.object" />

      <!-- Committed freehand stroke. -->
      <path
        v-else-if="item.kind === 'stroke'"
        :d="strokePath(item.object)"
        fill="none"
        :stroke="item.object.color"
        :stroke-width="item.object.width"
        :stroke-opacity="strokeOpacity(item.object)"
        :stroke-linecap="item.object.kind === 'highlighter' ? 'butt' : 'round'"
        stroke-linejoin="round"
        :style="isSelectedStroke(item.object.id) ? 'outline: none; filter: drop-shadow(0 0 2px #006EDB)' : null"
      />

      <!-- Straight line with endpoints (none/arrow/dot). -->
      <WhiteboardLine
        v-else-if="item.kind === 'line'"
        :line="item.object"
        :selected="isSelected('line', item.object.id)"
      />

      <!-- Table (grid + per-cell text + inline editor). -->
      <WhiteboardTable
        v-else-if="item.kind === 'table'"
        :table="item.object"
        :selected="isSelected('table', item.object.id)"
      />

      <!-- Sticky note (owns its drag/resize/edit/link). Matched by kind, not by a
           bare v-else: a kind added to WHITEBOARD_KINDS without a branch here
           would otherwise render as a sticky note with the wrong props. -->
      <WhiteboardStickyNote
        v-else-if="item.kind === 'sticky'"
        :note="item.object"
        :sketch="whiteboard.sketchStyle"
      />
    </template>

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

    <!-- Live line being dragged (before commit). -->
    <WhiteboardLine v-if="liveLine" :line="liveLine" />

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

    <!-- Laser pointer: just the dot, no trail (#102). Transient — never persisted
         or exported. Takes no pointer events so it can't eat the moves under it. -->
    <g style="pointer-events: none">
      <circle
        v-if="laserHead"
        :cx="laserHead.x"
        :cy="laserHead.y"
        :r="LASER_HEAD_RADIUS"
        :fill="LASER_COLOR"
        :fill-opacity="laserHead.opacity * 0.9"
      />
    </g>

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
