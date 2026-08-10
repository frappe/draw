<script setup>
// Floating minimap / navigator for block, flowchart, mind-map and unified
// diagrams (spec 1.1). Whiteboard has its own (WhiteboardMinimap), which already
// draws real strokes, so this one stays hidden there.
//
// It used to draw an APPROXIMATION: one glyph per shape or node, plus every
// whiteboard object — freehand ink, highlighter, tables — as a plain grey box.
// A board of handwriting therefore read as a scatter of rectangles rather than
// the drawing (#236, #237). Around 200 lines of per-type glyph building went
// with it: block, flowchart and mind-map item builders, two link builders, and a
// template branch per shape kind — a second renderer that could, and did, drift
// from the canvas.
//
// It now renders the document through documentToSvg, the same builder behind the
// home thumbnails and every export. The overview IS the drawing, in miniature.
import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { documentToSvg } from '@/composables/useThumbnail.js'
import { useMinimapNavigator, WIDTH, HEIGHT } from '@/composables/useMinimapNavigator.js'

const store = useDiagramStore()
const modeStrategy = useModeStrategy()

// Breathing room around the content, in canvas units, so nothing sits flush
// against the edge of the box.
const PAD = 24

const type = computed(() => modeStrategy.value.type)
// The whiteboard has its own navigator; every other type shows this one, even
// when empty, so the mini-navigator is always available (S4/B2/N15).
const shown = computed(() => type.value !== 'whiteboard')

// `xMinYMin` matters: useMinimapNavigator maps the frame's top-left to 0,0 at a
// uniform scale, so the picture has to be anchored the same way. The default
// `xMidYMid` would centre it and leave the viewport rectangle off the drawing.
const rendered = computed(() =>
  shown.value ? documentToSvg(store.getDocument(), { fit: 'xMinYMin meet' }) : '',
)

// documentToSvg frames its output over exactly the content, so reading that
// viewBox back is how the navigator learns the bounds. Deriving both from one
// render is what keeps the picture and the viewport rectangle in step — the old
// code computed bounds separately and the two could disagree.
const contentBounds = computed(() => readViewBox(rendered.value))

function readViewBox(markup) {
  const raw = markup.match(/viewBox="([^"]+)"/)?.[1]
  const [x, y, width, height] = String(raw || '').trim().split(/\s+/).map(Number)
  if (![x, y, width, height].every(Number.isFinite)) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, w: width, h: height }
}

const hasContent = computed(() => Boolean(contentBounds.value))

const frame = computed(() => {
  const box = contentBounds.value
  if (!box) return { x: 0, y: 0, w: 1, h: 1 }
  return { x: box.x - PAD, y: box.y - PAD, w: box.w + PAD * 2, h: box.h + PAD * 2 }
})

// Re-frame the rendered markup onto the padded box. A second documentToSvg call
// with an explicit viewBox would cost another full render for four numbers.
// `replace` (not replaceAll) hits the root <svg> only, which is the opening tag.
const overview = computed(() => {
  if (!hasContent.value) return ''
  const { x, y, w, h } = frame.value
  return rendered.value.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`)
})

// Fit/pan/drag mechanics (shared with WhiteboardMinimap). This navigator crops
// the viewport rect to its box, so it takes the clamped variant.
const { clampedViewRect: viewRect, onDown, onMove, onUp } = useMinimapNavigator(frame)
</script>

<template>
  <div
    v-if="shown"
    class="absolute bottom-3 right-3 z-10 rounded-lg border border-outline-gray-2 bg-surface-base/95 p-1 shadow-md backdrop-blur"
    aria-label="Minimap"
  >
    <div class="relative rounded" :style="{ width: `${WIDTH}px`, height: `${HEIGHT}px` }">
      <!-- The diagram itself, in miniature. Same markup the export produces, so
           what the overview shows is what the file would contain. -->
      <div
        v-if="hasContent"
        class="pointer-events-none absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
        v-html="overview"
      />

      <!-- Interaction and the viewport rectangle sit above it. -->
      <svg
        :width="WIDTH"
        :height="HEIGHT"
        class="absolute inset-0 rounded"
        style="cursor: pointer"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointerleave="onUp"
      >
        <!-- Viewport indicator — only when zoomed into a subset of the content
             (null when everything's already in view, so no boundary is drawn). -->
        <rect
          v-if="hasContent && viewRect"
          :x="viewRect.x"
          :y="viewRect.y"
          :width="Math.max(4, viewRect.w)"
          :height="Math.max(4, viewRect.h)"
          fill="rgba(0,110,219,0.10)"
          stroke="#006EDB"
          stroke-width="1.5"
        />

        <!-- Empty state: a faint prompt toward the toolbar. -->
        <template v-if="!hasContent">
          <text :x="WIDTH / 2" :y="HEIGHT / 2 - 5" text-anchor="middle" font-size="9" fill="#B0B7C0" style="font-family: Inter, sans-serif">
            Nothing to preview yet
          </text>
          <text :x="WIDTH / 2" :y="HEIGHT / 2 + 9" text-anchor="middle" font-size="9" fill="#B0B7C0" style="font-family: Inter, sans-serif">
            Add a shape from the toolbar above
          </text>
        </template>
      </svg>
    </div>
  </div>
</template>
