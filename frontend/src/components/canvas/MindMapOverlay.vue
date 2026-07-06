<script setup>
// Whimsical-style floating chrome for mind maps (replaces the right palette).
// - A contextual TOOLBAR that hovers just above the selected node with the common
//   per-node actions surfaced directly — bold/italic, fill, border, shape, text
//   size, marker, cross-link, note, delete (no nested "more"). Children are added
//   via the node's hover "+" or Tab.
// - The blank-map "Add your first idea" prompt.
// Positions are derived from the node's live layout box + the shared viewport, so
// the toolbar tracks the node at any pan/zoom. Mounted once per editor (EditorShell).
import { computed } from 'vue'
import { Popover, Tooltip, Dialog, Button } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import SwatchGrid from '@/components/floating/SwatchGrid.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useCanvasToolbarStyle } from '@/composables/useCanvasToolbarStyle.js'
import { layoutMindMap } from '@/diagram/mindmapLayout.js'
import { isRoot } from '@/diagram/mindmapModel.js'
import { resolveNodeColor, nodeFill } from '@/diagram/mindmapColors.js'
import { SWATCH_PALETTE } from '@/diagram/palette.js'
import { deleteNodes, clearMindmap } from '@/diagram/mindmapOperations.js'
import { mindmapUi, selectedNodeId, selectNode, beginEdit } from '@/stores/mindmapUi.js'

const store = useDiagramStore()
const editorUi = useEditorUi()

// Fill, branch and border all draw from the same rich Espresso/Frappe swatch
// family (spec: many more options), each in its own menu so the three knobs are
// independent — a node can be, say, white-filled with a green branch and a bold
// dark border.
const MARKER_ICONS = [
  'star', 'flag', 'circle-check', 'circle-alert', 'heart', 'zap',
  'bookmark', 'bell', 'target', 'lightbulb', 'sparkles', 'clock',
  'rocket', 'trophy', 'flame', 'thumbs-up', 'gift', 'eye',
]
const MIN_FONT = 10
const MAX_FONT = 48
const SHAPES = ['pill', 'rounded', 'ellipse', 'diamond', 'hexagon']

const model = computed(() => store.state.mindmap)
const isBlank = computed(() => (model.value?.nodes.length ?? 0) === 0)

const layout = computed(() =>
  model.value && model.value.rootId ? layoutMindMap(model.value) : { positions: {} },
)
const selId = computed(() => selectedNodeId(store))
// Every selected node (Fill/Border + Delete act on all of them when >1 selected).
const selectedNodes = computed(() =>
  (store.state.selection || []).map((id) => model.value?.nodes.find((n) => n.id === id)).filter(Boolean),
)
const multi = computed(() => selectedNodes.value.length > 1)
// Single-node controls (bold/italic, shape, text size, marker, cross-link, note)
// only make sense for a lone selection; `node` is null while multi-selecting.
const node = computed(() => (selectedNodes.value.length === 1 ? selectedNodes.value[0] : null))
const selectedIsRoot = computed(() => node.value && isRoot(model.value, node.value.id))
// Swatch previews mirror what the node layer actually renders (fillOf / branch /
// strokeColor in MindMapNodeLayer): an uncoloured node shows its resolved branch
// tint, not a fixed constant, so the toolbar dots match the node on canvas.
// Delete is enabled only when the selection holds a non-root node.
const fillPreview = computed(() => {
  const n = selectedNodes.value[0]
  if (!n) return '#FFFFFF'
  if (n.fill) return n.fill // explicit fill wins
  if (n.color) return nodeFill(n.color)
  return isRoot(model.value, n.id) ? '#F3F3F3' : nodeFill(resolveNodeColor(model.value, n, store.state.themePreset))
})
const branchPreview = computed(() => {
  const n = selectedNodes.value[0]
  if (!n) return '#4F94FF'
  return resolveNodeColor(model.value, n, store.state.themePreset)
})
const borderPreview = computed(() => {
  const n = selectedNodes.value[0]
  if (!n) return '#7C7C7C'
  return n.border || resolveNodeColor(model.value, n, store.state.themePreset)
})
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
function setFill(fill) {
  // Explicit node fill, its own field (null clears back to the branch tint).
  for (const n of selectedNodes.value) store.updateNode(n.id, { fill })
}
function setColor(color) {
  // Branch colour — drives the connector curve, the default border and (absent
  // an explicit fill) the fill tint. Recolours every selected node.
  for (const n of selectedNodes.value) store.updateNode(n.id, { color })
}
function setBorder(border) {
  // Border colour is its own field (null clears the override back to the branch).
  for (const n of selectedNodes.value) store.updateNode(n.id, { border })
}
function setFontSize(size) {
  patch({ fontSize: size })
}
// Text size as a +/- stepper (O6), not a row of preset buttons.
const currentFontSize = computed(() => node.value?.fontSize ?? (selectedIsRoot.value ? 17 : 14))
function stepFontSize(delta) {
  setFontSize(Math.max(MIN_FONT, Math.min(MAX_FONT, currentFontSize.value + delta)))
}
function setMarker(icon) {
  patch({ marker: { icon: node.value?.marker?.icon === icon ? null : icon } })
}
function setShape(shape) {
  patch({ shape })
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

// Confirm (in-product dialog) the delete requested by the keyboard handler for
// nodes that have sub-branches.
function confirmDeleteNodes() {
  const pending = mindmapUi.confirmDelete
  if (!pending) return
  if (pending.clearAll) {
    clearMindmap(store)
    selectNode(store, null)
  } else {
    const first = model.value?.nodes.find((n) => n.id === pending.ids[0])
    selectNode(store, first?.parentId || null)
    deleteNodes(store, pending.ids)
  }
  mindmapUi.confirmDelete = null
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

      <!-- Fill — its own menu; applies to every selected node. -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Fill">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <span class="h-4 w-4 rounded-full border border-black/10" :style="{ background: fillPreview }" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[204px] p-2">
            <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Fill</div>
            <SwatchGrid :colors="SWATCH_PALETTE" shape="square" class="mb-2" @select="setFill" />
            <button class="flex w-full items-center justify-center gap-1 rounded-md border border-outline-gray-2 py-1 text-[12px] text-ink-gray-6 hover:bg-surface-gray-2" @click="setFill(null)">
              Match branch
            </button>
          </div>
        </template>
      </Popover>

      <!-- Branch — the node's accent colour (curve + default border/tint). -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Branch colour">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <span class="h-4 w-4 rounded-full border border-black/10" :style="{ background: branchPreview }" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[204px] p-2">
            <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Branch</div>
            <SwatchGrid :colors="SWATCH_PALETTE" @select="setColor" />
          </div>
        </template>
      </Popover>

      <!-- Border — its own control, rendered as rings so it reads as a border. -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Border">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <span class="h-4 w-4 rounded-full border-[3px]" :style="{ borderColor: borderPreview }" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[204px] p-2">
            <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Border</div>
            <SwatchGrid :colors="SWATCH_PALETTE" shape="ring" class="mb-2" @select="setBorder" />
            <button class="flex w-full items-center justify-center gap-1 rounded-md border border-outline-gray-2 py-1 text-[12px] text-ink-gray-6 hover:bg-surface-gray-2" @click="setBorder(null)">
              Match branch
            </button>
          </div>
        </template>
      </Popover>

      <!-- Shape / Text size / Marker … Link / Note: single-selection per-node
           actions only. Children are added via the node's hover "+" or Tab. -->
      <template v-if="node">
      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

      <!-- Shape — surfaced directly (O8). -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Shape">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <LucideIcon name="shapes" class="h-4 w-4" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[196px] p-2">
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

      <!-- Text size — surfaced directly as a stepper (O5/O6). -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Text size">
            <button :class="btn" @mousedown.prevent @click="togglePopover()">
              <LucideIcon name="type" class="h-4 w-4" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[160px] p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Text size</div>
            <div class="flex items-center gap-1.5">
              <button class="flex h-7 w-7 items-center justify-center rounded-md border border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-2" @click="stepFontSize(-1)">
                <LucideIcon name="minus" class="h-3.5 w-3.5" />
              </button>
              <span class="flex-1 text-center text-[13px] font-medium text-ink-gray-9">{{ currentFontSize }}px</span>
              <button class="flex h-7 w-7 items-center justify-center rounded-md border border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-2" @click="stepFontSize(1)">
                <LucideIcon name="plus" class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </template>
      </Popover>

      <!-- Marker — surfaced directly. -->
      <Popover side="top">
        <template #target="{ togglePopover }">
          <Tooltip text="Marker">
            <button :class="[btn, activeBtn(!!node.marker?.icon)]" @mousedown.prevent @click="togglePopover()">
              <LucideIcon name="star" class="h-4 w-4" />
            </button>
          </Tooltip>
        </template>
        <template #body-main>
          <div class="w-[172px] p-2">
            <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Marker</div>
            <div class="flex flex-wrap gap-1.5">
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
          </div>
        </template>
      </Popover>

      <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />

      <Tooltip :text="mindmapUi.pendingLinkSource ? 'Click a target node…' : 'Link to node'">
        <button :class="[btn, activeBtn(!!mindmapUi.pendingLinkSource)]" @click="startCrosslink">
          <LucideIcon name="link-2" class="h-4 w-4" />
        </button>
      </Tooltip>
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

  <!-- In-product confirm for deleting nodes that have sub-branches (replaces the
       native browser confirm). -->
  <Dialog
    :model-value="!!mindmapUi.confirmDelete"
    :options="{ title: 'Delete nodes' }"
    @update:model-value="(v) => { if (!v) mindmapUi.confirmDelete = null }"
  >
    <template #body-content>
      <p class="text-base text-ink-gray-7">{{ mindmapUi.confirmDelete?.label }}</p>
    </template>
    <template #actions>
      <Button variant="solid" theme="red" @click="confirmDeleteNodes">Delete</Button>
      <Button @click="mindmapUi.confirmDelete = null">Cancel</Button>
    </template>
  </Dialog>
</template>
