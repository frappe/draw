<script setup>
// Mind-map right palette (spec diagram-types A9, step M6). Per the spec it shows
// node fill/text color, font size, branch color, marker (icon + color dot),
// collapse/expand all, focus-mode toggle, outline-view toggle, and theme presets
// — and HIDES the free arrange/align/distribute/same-size/swap/rotate tools.
// Edits apply to the selected node(s) via store.updateNode (one undoable unit
// each); the structural toggles use mindmapOperations.
import { computed } from 'vue'
import { Tooltip, FeatherIcon } from 'frappe-ui'
import PaletteSection from './PaletteSection.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { branchPalette } from '@/diagram/mindmapColors.js'
import { collapseAll, clearMap } from '@/diagram/mindmapOperations.js'
import { mindmapUi, selectedNodeId } from '@/stores/mindmapUi.js'

const store = useDiagramStore()

const FILL_SWATCHES = ['#EFEAFE', '#EFF6FF', '#F4FFF6', '#FDFAED', '#FCEAF5', '#F3F3F3']
const FONT_SIZES = [12, 14, 17, 22]
const MARKER_ICONS = ['star', 'flag', 'check-circle', 'alert-circle', 'heart', 'zap']
// Curated emoji shown before a node's label (spec 13.3).
const EMOJIS = ['💡', '✅', '⭐', '🔥', '⚠️', '❤️', '📌', '🎯', '🚀', '📝', '❓', '👍']

const selectedIds = computed(() => store.state.selection.filter(byNodeId))
const reference = computed(() => nodeById(selectedIds.value[0]))
const hasSelection = computed(() => selectedIds.value.length > 0)

function byNodeId(id) {
  return Boolean(nodeById(id))
}

function nodeById(id) {
  return store.state.mindmap?.nodes.find((node) => node.id === id)
}

function patchSelected(patch) {
  for (const id of selectedIds.value) store.updateNode(id, patch)
}

function setFill(color) {
  patchSelected({ color })
}

function setFontSize(size) {
  patchSelected({ fontSize: size })
}

function setMarkerColor(color) {
  patchSelected({ marker: { colorDot: color } })
}

function setMarkerIcon(icon) {
  const next = reference.value?.marker?.icon === icon ? null : icon
  patchSelected({ marker: { icon: next } })
}

function setNote(text) {
  patchSelected({ note: text })
}

function setEmoji(emoji) {
  const next = reference.value?.emoji === emoji ? null : emoji
  patchSelected({ emoji: next })
}

const branchSwatches = computed(() => branchPalette(store.state.themePreset))
const fontSize = computed(() => reference.value?.fontSize ?? 14)
const note = computed(() => reference.value?.note ?? '')

function startCrosslink() {
  mindmapUi.pendingLinkSource = selectedNodeId(store)
}

// Empty state (A10): only the root exists — show the keyboard hint over the map.
const isEmpty = computed(() => (store.state.mindmap?.nodes.length ?? 0) <= 1)
</script>

<template>
  <PaletteSection label="View">
    <div class="flex flex-wrap gap-1.5">
      <button class="fd-mm-chip" @click="collapseAll(store, true)">
        <FeatherIcon name="minimize-2" class="h-3.5 w-3.5" /> Collapse all
      </button>
      <button class="fd-mm-chip" @click="collapseAll(store, false)">
        <FeatherIcon name="maximize-2" class="h-3.5 w-3.5" /> Expand all
      </button>
    </div>
  </PaletteSection>

  <PaletteSection label="Node color">
    <div class="mb-2 flex flex-wrap gap-1.5">
      <button
        v-for="color in FILL_SWATCHES"
        :key="color"
        class="h-[22px] w-[22px] rounded-[5px] border border-black/10 disabled:opacity-40"
        :style="{ background: color }"
        :disabled="!hasSelection"
        @click="setFill(color)"
      />
    </div>
    <div class="mb-1 text-[10px] text-ink-gray-5">Branch color</div>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="color in branchSwatches"
        :key="color"
        class="h-[22px] w-[22px] rounded-full border border-black/10 disabled:opacity-40"
        :style="{ background: color }"
        :disabled="!hasSelection"
        @click="setFill(color)"
      />
    </div>
  </PaletteSection>

  <PaletteSection label="Text size">
    <div class="flex gap-1.5">
      <button
        v-for="size in FONT_SIZES"
        :key="size"
        class="flex-1 rounded-md border px-2 py-1 text-xs disabled:opacity-40"
        :class="fontSize === size ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-outline-gray-1 text-ink-gray-7'"
        :disabled="!hasSelection"
        @click="setFontSize(size)"
      >
        {{ size }}
      </button>
    </div>
  </PaletteSection>

  <PaletteSection label="Marker">
    <div class="mb-2 flex flex-wrap gap-1.5">
      <Tooltip v-for="icon in MARKER_ICONS" :key="icon" :text="icon">
        <button
          class="flex h-[26px] w-[26px] items-center justify-center rounded-md border disabled:opacity-40"
          :class="reference?.marker?.icon === icon ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-outline-gray-1 text-ink-gray-7'"
          :disabled="!hasSelection"
          @click="setMarkerIcon(icon)"
        >
          <FeatherIcon :name="icon" class="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
    <div class="mb-1 text-[10px] text-ink-gray-5">Color dot</div>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="color in branchSwatches"
        :key="`dot-${color}`"
        class="h-[20px] w-[20px] rounded-full border border-black/10 disabled:opacity-40"
        :style="{ background: color }"
        :disabled="!hasSelection"
        @click="setMarkerColor(color)"
      />
    </div>
  </PaletteSection>

  <PaletteSection label="Emoji">
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="emoji in EMOJIS"
        :key="emoji"
        class="flex h-[26px] w-[26px] items-center justify-center rounded-md border text-[15px] leading-none disabled:opacity-40"
        :class="reference?.emoji === emoji ? 'border-blue-500 bg-blue-50' : 'border-outline-gray-1'"
        :disabled="!hasSelection"
        :aria-label="`Emoji ${emoji}`"
        :aria-pressed="reference?.emoji === emoji"
        @click="setEmoji(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
  </PaletteSection>

  <PaletteSection label="Cross-link & note">
    <button class="fd-mm-chip mb-2 w-full justify-center disabled:opacity-40" :disabled="!hasSelection" @click="startCrosslink()">
      <FeatherIcon name="link-2" class="h-3.5 w-3.5" />
      {{ mindmapUi.pendingLinkSource ? 'Click target node…' : 'Link to node' }}
    </button>
    <textarea
      class="w-full resize-none rounded-md border border-outline-gray-1 px-2 py-1 text-xs text-ink-gray-7 disabled:opacity-40"
      rows="2"
      placeholder="Add a note…"
      :value="note"
      :disabled="!hasSelection"
      @change="setNote($event.target.value)"
    />
  </PaletteSection>

  <PaletteSection label="Map">
    <button class="fd-mm-chip mb-2 w-full justify-center" @click="store.convertDiagram('flowchart')">
      <FeatherIcon name="git-commit" class="h-3.5 w-3.5" /> Convert to flowchart
    </button>
    <button class="fd-mm-chip w-full justify-center text-red-600" @click="clearMap(store)">
      <FeatherIcon name="trash-2" class="h-3.5 w-3.5" /> Clear map
    </button>
  </PaletteSection>

  <!-- Empty-state hint (A10), shown over the canvas when only the root exists.
       Solid dark pill (explicit color so it never washes out on the canvas). -->
  <Teleport to="body">
    <div
      v-if="isEmpty"
      class="pointer-events-none fixed bottom-[86px] left-1/2 z-10 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[12px] text-white shadow-lg"
      style="background-color: #171717"
    >
      Hover a node's edge and click <b>+</b> to add a branch, or press <b>Tab</b>.
    </div>
  </Teleport>
</template>

<style scoped>
.fd-mm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  border: 1px solid var(--outline-gray-1, #e2e2e2);
  padding: 4px 8px;
  font-size: 11px;
  color: var(--ink-gray-7, #525252);
}
.fd-mm-chip:hover {
  background: var(--surface-gray-2, #f3f3f3);
}
.fd-mm-chip-on {
  border-color: #006edb;
  background: #eff6ff;
  color: #006edb;
}
</style>
