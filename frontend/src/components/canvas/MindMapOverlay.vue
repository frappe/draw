<script setup>
// Whimsical-style floating chrome for mind maps (replaces the right palette).
// - A contextual TOOLBAR that hovers just above the selected node with the common
//   per-node actions (bold/italic, colour, emoji, add child, cross-link, note,
//   text size + marker under "more", delete).
// - The blank-map "Add your first idea" prompt and the root-only keyboard hint.
// Positions are derived from the node's live layout box + the shared viewport, so
// the toolbar tracks the node at any pan/zoom. Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Popover, Tooltip } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { isRoot } from '@/diagram/mindmapModel.js'
import { branchPalette } from '@/diagram/mindmapColors.js'
import { deleteNodes } from '@/diagram/mindmapOperations.js'
import { mindmapUi, selectedNodeId, selectNode, beginEdit } from '@/stores/mindmapUi.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

const FILL_SWATCHES = ['#EFEAFE', '#EFF6FF', '#F4FFF6', '#FDFAED', '#FCEAF5', '#F3F3F3', '#FFFFFF']
const EMOJIS = ['💡', '✅', '⭐', '🔥', '⚠️', '❤️', '📌', '🎯', '🚀', '📝', '❓', '👍']
const MARKER_ICONS = ['star', 'flag', 'check-circle', 'alert-circle', 'heart', 'zap']
const FONT_SIZES = [12, 14, 17, 22]
const SHAPES = ['pill', 'rounded', 'ellipse', 'diamond', 'hexagon']

const model = computed(() => store.state.mindmap)
const isBlank = computed(() => (model.value?.nodes.length ?? 0) === 0)
const isRootOnly = computed(() => (model.value?.nodes.length ?? 0) === 1)

const layout = computed(() =>
  model.value && model.value.rootId ? layoutMindMap(model.value) : { positions: {} },
)
const selId = computed(() => selectedNodeId(store))
// Every selected node (Colour + Delete act on all of them when >1 selected).
const selectedNodes = computed(() =>
  (store.state.selection || []).map((id) => model.value?.nodes.find((n) => n.id === id)).filter(Boolean),
)
const multi = computed(() => selectedNodes.value.length > 1)
// Single-node controls (bold/italic, emoji, add-child, cross-link, note, more…)
// only make sense for a lone selection; `node` is null while multi-selecting.
const node = computed(() => (selectedNodes.value.length === 1 ? selectedNodes.value[0] : null))
const branchSwatches = computed(() => branchPalette(store.state.themePreset))
const selectedIsRoot = computed(() => node.value && isRoot(model.value, node.value.id))
// Colour swatch preview + whether a delete would remove anything (never the root).
const colorPreview = computed(() => selectedNodes.value[0]?.color || '#EFEAFE')
const canDelete = computed(() => selectedNodes.value.some((n) => !isRoot(model.value, n.id)))

// Combined bounding box of the selected nodes (a single node's own box when one
// is selected), so the toolbar hovers above the whole group.
const box = computed(() => {
  const boxes = selectedNodes.value.map((n) => layout.value.positions[n.id]).filter(Boolean)
  if (!boxes.length) return null
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.w))
  const bottom = Math.max(...boxes.map((b) => b.y + b.h))
  return { x, y, w: right - x, h: bottom - y }
})

// Toolbar screen position: above the (combined) box, horizontally centred on it
// (shared with the block/flowchart/whiteboard selection toolbars).
const toolbarStyle = useCanvasToolbarStyle(box)

// --- per-node actions -------------------------------------------------------
function patch(p) {
  if (selId.value) store.updateNode(selId.value, p)
}
function toggleBold() {
  if (node.value) patch({ bold: !node.value.bold })
}
function toggleItalic() {
  if (node.value) patch({ italic: !node.value.italic })
}
function setColor(color) {
  // Recolour every selected node (each an undoable updateNode); single falls
  // through to the same path.
  for (const n of selectedNodes.value) store.updateNode(n.id, { color })
}
function setEmoji(emoji) {
  patch({ emoji: node.value?.emoji === emoji ? null : emoji })
}
function setFontSize(size) {
  patch({ fontSize: size })
}
function setMarker(icon) {
  patch({ marker: { icon: node.value?.marker?.icon === icon ? null : icon } })
}
function setShape(shape) {
  patch({ shape })
}
function setNote(text) {
  patch({ note: text })
}
function addChild() {
  const id = store.addChildNode(selId.value)
  if (!id) return
  selectNode(store, id)
  beginEdit(id)
}
function startCrosslink() {
  mindmapUi.pendingLinkSource = selId.value
}
function removeNode() {
  // Delete every selected non-root node (the root is never deletable) as one
  // undoable unit.
  const ids = selectedNodes.value.filter((n) => !isRoot(model.value, n.id)).map((n) => n.id)
  deleteNodes(store, ids)
}

// --- blank map --------------------------------------------------------------
function addFirstIdea() {
  const id = store.addRootNode('')
  if (!id) return
  selectNode(store, id)
  beginEdit(id)
  setTimeout(() => editorUi.fit?.(), 0)
}

const btn = 'flex h-8 w-8 items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
function activeBtn(on) {
  return on ? 'bg-surface-gray-3 text-ink-gray-9' : ''
}
</script>

<template>
  <!-- Contextual toolbar above the selected node. -->
  <Teleport to="body">
    <div
      v-if="selectedNodes.length && box"
      data-mm-toolbar
      class="fixed z-30 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-outline-gray-2 bg-surface-base p-1 shadow-lg"
      :style="toolbarStyle"
    >
      <!-- Single-selection text styling; hidden when multiple nodes are selected. -->
      <template v-if="node">
        <Tooltip text="Bold">
          <button :class="[btn, activeBtn(node.bold)]" @mousedown.prevent @click="toggleBold">
            <LucideIcon name="bold" class="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip text="Italic">
          <button :class="[btn, activeBtn(node.italic)]" @mousedown.prevent @click="toggleItalic">
            <LucideIcon name="italic" class="h-4 w-4" />
          </button>
        </Tooltip>

        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
      </template>

      <!-- Colour — applies to every selected node (single or multi). -->
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="Colour">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <span class="h-4 w-4 rounded-full border border-black/10" :style="{ background: colorPreview }" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[180px] p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Node</div>
            <div class="mb-2 flex flex-wrap gap-1.5">
              <button v-for="c in FILL_SWATCHES" :key="c" class="h-6 w-6 rounded-md border border-black/10" :style="{ background: c }" @click="setColor(c)" />
            </div>
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Branch</div>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="c in branchSwatches" :key="c" class="h-6 w-6 rounded-full border border-black/10" :style="{ background: c }" @click="setColor(c)" />
            </div>
          </div>
        </template>
      </Popover>

      <!-- Emoji … More: single-selection per-node actions only. -->
      <template v-if="node">
      <!-- Emoji -->
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="Emoji">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <span v-if="node.emoji" class="text-[15px] leading-none">{{ node.emoji }}</span>
              <LucideIcon v-else name="smile" class="h-4 w-4" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="grid w-[184px] grid-cols-6 gap-1 p-2">
            <button v-for="e in EMOJIS" :key="e" class="flex h-7 w-7 items-center justify-center rounded text-[16px] hover:bg-surface-gray-2" @click="setEmoji(e)">{{ e }}</button>
          </div>
        </template>
      </Popover>

      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

      <Tooltip text="Add child (Tab)">
        <button :class="btn" @click="addChild"><LucideIcon name="plus" class="h-4 w-4" /></button>
      </Tooltip>
      <Tooltip :text="mindmapUi.pendingLinkSource ? 'Click a target node…' : 'Link to node'">
        <button :class="[btn, activeBtn(!!mindmapUi.pendingLinkSource)]" @click="startCrosslink">
          <LucideIcon name="link-2" class="h-4 w-4" />
        </button>
      </Tooltip>

      <!-- Note -->
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="Note">
            <button :class="[btn, activeBtn(!!node.note)]" @mousedown.prevent @click="togglePopover()">
              <LucideIcon name="file-text" class="h-4 w-4" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[220px] p-2">
            <textarea
              :value="node.note || ''"
              rows="3"
              placeholder="Add a note…"
              class="w-full resize-none rounded-md border border-outline-gray-2 px-2 py-1 text-[13px] text-ink-gray-8 outline-none focus:border-outline-gray-3"
              @change="setNote($event.target.value)"
            />
          </div>
        </template>
      </Popover>

      <!-- More: text size + marker -->
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="More">
            <button :class="btn" @mousedown.prevent @click="togglePopover()"><LucideIcon name="more-horizontal" class="h-4 w-4" /></button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[196px] p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Text size</div>
            <div class="mb-2 flex gap-1">
              <button
                v-for="s in FONT_SIZES"
                :key="s"
                class="flex-1 rounded-md border px-2 py-1 text-xs"
                :class="(node.fontSize ?? (selectedIsRoot ? 17 : 14)) === s ? 'border-ink-gray-9 bg-surface-gray-2 text-ink-gray-9' : 'border-outline-gray-2 text-ink-gray-7'"
                @click="setFontSize(s)"
              >{{ s }}</button>
            </div>
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Marker</div>
            <div class="mb-2 flex flex-wrap gap-1.5">
              <button
                v-for="icon in MARKER_ICONS"
                :key="icon"
                class="flex h-7 w-7 items-center justify-center rounded-md border"
                :class="node.marker?.icon === icon ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-outline-gray-1 text-ink-gray-7'"
                @click="setMarker(icon)"
              >
                <LucideIcon :name="icon" class="h-4 w-4" />
              </button>
            </div>

            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Shape</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="s in SHAPES"
                :key="s"
                class="flex h-7 w-9 items-center justify-center rounded-md border"
                :class="(node.shape || 'pill') === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-outline-gray-1 text-ink-gray-6'"
                :title="s"
                @click="setShape(s)"
              >
                <svg width="22" height="14" viewBox="0 0 22 14">
                  <rect v-if="s === 'pill'" x="1" y="2" width="20" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <rect v-else-if="s === 'rounded'" x="1" y="2" width="20" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <ellipse v-else-if="s === 'ellipse'" cx="11" cy="7" rx="10" ry="6" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <polygon v-else-if="s === 'diamond'" points="11,1 21,7 11,13 1,7" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <polygon v-else points="4,1 18,1 21,7 18,13 4,13 1,7" fill="none" stroke="currentColor" stroke-width="1.3" />
                </svg>
              </button>
            </div>
          </div>
        </template>
      </Popover>
      </template>

      <!-- Delete — every selected non-root node (root is never deletable). -->
      <template v-if="canDelete">
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
        <Tooltip :text="multi ? 'Delete nodes' : 'Delete node'">
          <button class="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50" @click="removeNode">
            <LucideIcon name="trash-2" class="h-4 w-4" />
          </button>
        </Tooltip>
      </template>
    </div>
  </Teleport>

  <!-- Blank map: one inviting prompt to add the first idea. -->
  <Teleport to="body">
    <button
      v-if="isBlank"
      class="fixed left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-dashed border-outline-gray-3 bg-surface-base px-5 py-3 text-[14px] font-medium text-ink-gray-7 shadow-sm hover:border-ink-gray-8 hover:text-ink-gray-9"
      @click="addFirstIdea"
    >
      <LucideIcon name="plus" class="h-4 w-4" /> Add your first idea
    </button>
  </Teleport>

  <!-- Root-only: hint to grow the map. -->
  <Teleport to="body">
    <div
      v-if="isRootOnly"
      class="pointer-events-none fixed bottom-[86px] left-1/2 z-10 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[12px] text-white shadow-lg"
      style="background-color: #171717"
    >
      Hover a node and click <b>+</b> to add a branch, or press <b>Tab</b>.
    </div>
  </Teleport>
</template>
