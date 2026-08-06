<script setup>
// Comment pins over the canvas (#108). A pin sits at a board point or on a shape's
// bottom-right corner, follows pan/zoom and the shape as it moves, and opens its
// thread on click. A draft (a comment being placed) shows its own pin with an open
// composer. The overlay shares the canvas surface's coordinate origin (both fill
// <main>), so a board point (x,y) maps to surface pixels (panX + x*zoom, panY +
// y*zoom) — no rect math, unlike the body-teleported cursors.
import { ref, computed } from 'vue'
import { Button, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useComments } from '@/composables/useComments.js'
import { anchorPoint } from '@/diagram/geometry.js'
import { commentPreview } from './commentMarkup.js'
import CommentThread from './CommentThread.vue'
import CommentComposer from './CommentComposer.vue'

const editorUi = useEditorUi()
const store = useDiagramStore()
const comments = useComments()
const viewport = editorUi.viewport

const layer = ref(null)
const CARD_W = 320

// A root comment's anchor in board units, or null if its shape is gone.
function anchorOf(comment) {
  if (comment.anchor_type === 'board') return { x: comment.board_x, y: comment.board_y }
  if (comment.anchor_type === 'shape') {
    const shape = store.shapeById(comment.shape_id)
    return shape ? anchorPoint(shape, 'bottom-right') : null
  }
  return null
}

// Board point -> surface pixels (reactive on pan/zoom).
function toScreen(point) {
  const { panX, panY, zoom } = viewport.state
  return { left: panX + point.x * zoom, top: panY + point.y * zoom }
}

// Unresolved, anchored pins with a screen position. Resolved threads leave the
// canvas (reachable from the panel) so the board doesn't fill with old markers.
const pins = computed(() =>
  comments.pins.value
    .filter((t) => !t.root.resolved)
    .map((t) => {
      const point = anchorOf(t.root)
      return point ? { thread: t, ...toScreen(point) } : null
    })
    .filter(Boolean),
)

const activeCard = computed(() => {
  const name = comments.activeThread.value
  if (!name) return null
  const thread = comments.threads.value.find((t) => t.root.name === name)
  if (!thread) return null
  const point = anchorOf(thread.root)
  return point ? { thread, ...place(toScreen(point)) } : null
})

const draftCard = computed(() => {
  const draft = comments.draft.value
  if (!draft) return null
  const point =
    draft.anchorType === 'shape'
      ? (store.shapeById(draft.shapeId) && anchorPoint(store.shapeById(draft.shapeId), 'bottom-right')) || null
      : { x: draft.x, y: draft.y }
  return point ? place(toScreen(point)) : null
})

// Position a card next to a pin, nudged to stay inside the canvas area.
function place({ left, top }) {
  const box = layer.value?.getBoundingClientRect()
  const width = box?.width || CARD_W * 2
  const height = box?.height || 600
  let x = left + 18
  if (x + CARD_W > width) x = Math.max(8, left - CARD_W - 8)
  let y = Math.max(8, top - 8)
  if (y + 240 > height) y = Math.max(8, height - 248)
  return { cardLeft: x, cardTop: y }
}

function pinLabel(thread) {
  const count = 1 + (thread.replies?.length || 0)
  return count > 1 ? String(count) : ''
}

function openThread(thread) {
  comments.openThread(thread.root.name)
}

async function submitDraft(content) {
  await comments.submitDraft(content)
}
</script>

<template>
  <div ref="layer" class="pointer-events-none absolute inset-0 z-30 overflow-hidden">
    <!-- pins -->
    <Tooltip v-for="pin in pins" :key="pin.thread.root.name" :text="commentPreview(pin.thread.root.content)">
      <button
        class="pointer-events-auto absolute flex h-7 w-7 -translate-y-full items-center justify-center rounded-full rounded-bl-none border border-white bg-surface-gray-7 text-p-xs font-semibold text-white shadow-md transition hover:bg-surface-gray-6"
        :class="comments.activeThread.value === pin.thread.root.name ? 'ring-2 ring-outline-gray-3' : ''"
        :style="{ left: `${pin.left}px`, top: `${pin.top}px` }"
        @click="openThread(pin.thread)"
      >
        <LucideIcon v-if="!pinLabel(pin.thread)" name="message-square" class="h-3.5 w-3.5" />
        <span v-else>{{ pinLabel(pin.thread) }}</span>
      </button>
    </Tooltip>

    <!-- open thread card -->
    <div
      v-if="activeCard"
      class="pointer-events-auto absolute"
      :style="{ left: `${activeCard.cardLeft}px`, top: `${activeCard.cardTop}px`, width: `${CARD_W}px` }"
    >
      <div class="mb-1 flex justify-end">
        <Button
          variant="ghost"
          theme="gray"
          size="sm"
          icon="lucide-x"
          tooltip="Close comment"
          label="Close comment"
          @click="comments.closeThread()"
        />
      </div>
      <CommentThread :thread="activeCard.thread" variant="popover" />
    </div>

    <!-- draft (placing a new comment) -->
    <div
      v-if="draftCard"
      class="pointer-events-auto absolute rounded-lg border border-outline-gray-2 bg-surface-elevation-1 p-3 shadow-2xl"
      :style="{ left: `${draftCard.cardLeft}px`, top: `${draftCard.cardTop}px`, width: `${CARD_W}px` }"
    >
      <CommentComposer autofocus placeholder="Add a comment…" @submit="submitDraft" @cancel="comments.cancelDraft()" />
    </div>
  </div>
</template>
