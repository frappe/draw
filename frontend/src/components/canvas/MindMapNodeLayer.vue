<script setup>
// Renders a laid-out mind map (spec diagram-types Part A, steps M2-M6):
// branch-colored curved bezier connectors (M3), dotted cross-links (M5), pill
// nodes with markers + collapse toggles + count badges (M4/M5), inline text
// editing (M2), drag-to-reparent (M4), and focus-mode dimming (M6). Each node is
// a <g transform> with a CSS transition so re-layout animates (Part G11). All
// semantic edits go through store mutations / mindmapOperations (one undoable
// unit each); positions are derived by mindmapLayout, never stored.
import { computed, nextTick, ref, watch } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { FeatherIcon } from 'frappe-ui'
import {
  branchPath,
  isNodeHidden,
  hiddenDescendantCount,
} from '@/diagram/mindmapLayout.js'
import { resolveNodeColor, nodeFill, readableInk } from '@/diagram/mindmapColors.js'
import { isRoot, subtreeIds } from '@/diagram/mindmapModel.js'
import { toggleNodeCollapsed, pasteOutline, linkNodes } from '@/diagram/mindmapOperations.js'
import { looksLikeOutline } from '@/diagram/mindmapPaste.js'
import { useMindmapInteraction } from '@/composables/useMindmapInteraction.js'
import { mindmapUi, selectedNodeId, selectNode, beginEdit, endEdit } from '@/stores/mindmapUi.js'
import { mindmapKeydownInEdit } from '@/composables/useMindmapEditKeys.js'
// Side-effect import: registers the mind-map keyboard handler into the shared
// keyboard seam (the dispatcher calls it for non-edit keys).
import '@/composables/useMindmapKeys.js'

const props = defineProps({
  mindmap: { type: Object, required: true },
  positions: { type: Object, required: true },
})

const store = useDiagramStore()
const editorUi = useEditorUi()
const positionsRef = computed(() => props.positions)
const interaction = useMindmapInteraction(store, editorUi.viewport, positionsRef)
const editFields = ref({})

function box(id) {
  return props.positions[id]
}

// Whenever a node enters edit mode (via keyboard create or palette), move focus
// into its field and select its text, after Vue mounts the foreignObject.
watch(
  () => mindmapUi.editingId,
  (id) => {
    if (id) nextTick(() => focusField(id))
  },
)

// Visible nodes: those whose ancestors are all expanded (collapsed subtrees draw
// nothing and were given zero layout space).
const visibleNodes = computed(() =>
  props.mindmap.nodes
    .filter((node) => box(node.id) && !isNodeHidden(props.mindmap, node.id))
    .map((node) => ({ node, box: box(node.id) })),
)

// One curved, branch-colored connector per visible non-root node.
const links = computed(() =>
  visibleNodes.value
    .filter(({ node }) => node.parentId && box(node.parentId))
    .map(({ node }) => ({
      id: node.id,
      d: branchPath(box(node.parentId), box(node.id)),
      color: colorOf(node),
    })),
)

// Dotted cross-links between any two visible nodes (rendered distinctly, M5).
const crosslinks = computed(() =>
  props.mindmap.crosslinks
    .filter((link) => box(link.fromId) && box(link.toId))
    .filter((link) => !hidden(link.fromId) && !hidden(link.toId))
    .map((link) => ({ id: link.id, label: link.label, ...crosslinkGeometry(link) })),
)

function crosslinkGeometry(link) {
  const a = centerOf(link.fromId)
  const b = centerOf(link.toId)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
}

function centerOf(id) {
  const b = box(id)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

function hidden(id) {
  return isNodeHidden(props.mindmap, id)
}

function colorOf(node) {
  return resolveNodeColor(props.mindmap, node, store.state.themePreset)
}

function fillOf(node) {
  return node.color ? nodeFill(node.color) : isRoot(props.mindmap, node.id) ? '#ECE7FE' : nodeFill(colorOf(node))
}

function inkOf(node) {
  return readableInk(fillOf(node))
}

function isSelected(id) {
  return selectedNodeId(store) === id
}

// Focus mode dims everything outside the focused node's branch (M6).
const focusedSubtree = computed(() =>
  mindmapUi.focusId ? new Set(subtreeIds(props.mindmap, mindmapUi.focusId)) : null,
)

function dimmed(id) {
  const focus = focusedSubtree.value
  return focus ? !focus.has(id) : false
}

function childCount(id) {
  return hiddenDescendantCount(props.mindmap, id)
}

function hasChildren(id) {
  return props.mindmap.nodes.some((node) => node.parentId === id)
}

// --- add-a-child affordance (hover ghost node) -----------------------------
const ADD_GAP = 26
const ADD_W = 88

function rootCenterX() {
  const root = box(props.mindmap.rootId)
  return root ? root.x + root.w / 2 : 0
}

// The branch side(s) a node grows on: the root grows both ways; any other node
// grows on the side it already sits relative to the root.
function addSidesFor(node, b) {
  if (isRoot(props.mindmap, node.id)) return ['right', 'left']
  return [b.x + b.w / 2 >= rootCenterX() ? 'right' : 'left']
}

// A dashed ghost pill (+ a connector stub and a plus) shown on hover, in node-
// local coordinates, so clicking it adds a child on that side.
function ghostsFor(node, b) {
  return addSidesFor(node, b).map((side) => {
    const x = side === 'right' ? b.w + ADD_GAP : -ADD_GAP - ADD_W
    return {
      side,
      line: { x1: side === 'right' ? b.w : 0, y1: b.h / 2, x2: side === 'right' ? x : x + ADD_W, y2: b.h / 2 },
      rect: { x, y: 0, w: ADD_W, h: b.h },
      cx: x + ADD_W / 2,
      cy: b.h / 2,
    }
  })
}

function addChild(event, parentId) {
  startEdit(event, store.addChildNode(parentId))
}

// Edit-field style matches the node's static text and centres a single line via
// line-height = node height (so the caret sits in the vertical middle, not top).
function nodeFontSize(node) {
  return node.fontSize || (isRoot(props.mindmap, node.id) ? 17 : 14)
}

function editStyle(node, b) {
  return {
    height: b.h + 'px',
    lineHeight: b.h + 'px',
    fontSize: nodeFontSize(node) + 'px',
    fontWeight: isRoot(props.mindmap, node.id) ? 700 : 500,
    color: inkOf(node),
  }
}

function surfaceRect(event) {
  const surface = event.target.closest('[data-fdpreset]')
  return surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
}

// Pointer down on a node: cross-link mode wires two nodes; otherwise select +
// begin a possible drag-to-reparent (the interaction composable thresholds it).
function onNodePointerDown(event, id) {
  event.stopPropagation()
  if (mindmapUi.pendingLinkSource) return finishLink(id)
  interaction.startDrag(event, id, surfaceRect(event))
}

function finishLink(id) {
  linkNodes(store, mindmapUi.pendingLinkSource, id)
  mindmapUi.pendingLinkSource = null
}

function onNodeClick(event, id) {
  event.stopPropagation()
  selectNode(store, id)
}

function startEdit(event, id) {
  event.stopPropagation()
  beginEdit(id)
  selectNode(store, id)
  nextTick(() => focusField(id))
}

function focusField(id) {
  const field = editFields.value[id]
  if (!field) return
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// Commit edited text back to the model on blur (one undoable update). Only clear
// the editing flag if THIS node is still the one being edited — a Tab/Enter
// create has already moved editing to the new node, and we must not clobber it.
function commitText(id) {
  const field = editFields.value[id]
  const node = props.mindmap.nodes.find((candidate) => candidate.id === id)
  const text = field ? field.innerText.trim() : node?.text
  if (node && text !== node.text) store.updateNode(id, { text })
  if (mindmapUi.editingId === id) endEdit()
}

// In-edit keys: Tab/Enter/Shift+Enter/Esc are handled on the editable element
// (the global dispatcher ignores editable targets, Part G5).
function onEditKeydown(event, id) {
  commitTextIfNeeded(event, id)
  mindmapKeydownInEdit(event, id, store, editFields.value[id])
}

// Before a Tab/Enter create, fold the typed text straight into the model node
// (no separate commit) so the create's history snapshot captures it — one undo
// then reverts both the text and the new node together.
function commitTextIfNeeded(event, id) {
  const creates = event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)
  if (!creates) return
  const field = editFields.value[id]
  const node = props.mindmap.nodes.find((candidate) => candidate.id === id)
  if (field && node) node.text = field.innerText.trim()
}

// Paste onto a node: an indented/bulleted outline grows a subtree; plain text
// falls through to normal contentEditable insertion (M5).
function onPaste(event, id) {
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!looksLikeOutline(text)) return
  event.preventDefault()
  const field = editFields.value[id]
  if (field) store.updateNode(id, { text: field.innerText.trim() })
  endEdit()
  pasteOutline(store, id, text)
}

function toggleCollapse(event, id) {
  event.stopPropagation()
  toggleNodeCollapsed(store, id)
}

function isEditing(id) {
  return mindmapUi.editingId === id
}

function dragOffset(id) {
  return interaction.drag.active && interaction.drag.nodeId === id
    ? { x: interaction.drag.dx, y: interaction.drag.dy }
    : { x: 0, y: 0 }
}

function isDropTarget(id) {
  return interaction.drag.dropTargetId === id
}
</script>

<template>
  <g>
    <!-- Branch curves (no arrowheads, branch-colored) — spec A4/M3. -->
    <path
      v-for="link in links"
      :key="link.id"
      :d="link.d"
      fill="none"
      :stroke="link.color"
      stroke-width="2.5"
      stroke-linecap="round"
      :opacity="dimmed(link.id) ? 0.12 : 1"
    />

    <!-- Cross-links: dotted, distinct, optionally labeled — spec A4/M5. -->
    <g v-for="link in crosslinks" :key="link.id">
      <line
        :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2"
        stroke="#7C7C7C" stroke-width="1.5" stroke-dasharray="2 5" stroke-linecap="round"
      />
      <g v-if="link.label" :transform="`translate(${link.mx} ${link.my})`">
        <rect x="-26" y="-10" width="52" height="20" rx="6" fill="#FFFFFF" stroke="#C7C7C7" />
        <text text-anchor="middle" dominant-baseline="central" font-size="11" fill="#525252"
          style="font-family: Inter, sans-serif">{{ link.label }}</text>
      </g>
    </g>

    <!-- Nodes. -->
    <g
      v-for="{ node, box } in visibleNodes"
      :key="node.id"
      class="fd-mm-node"
      :style="{ transition: interaction.drag.active ? 'none' : 'transform 200ms ease', opacity: dimmed(node.id) ? 0.18 : 1 }"
      :transform="`translate(${box.x + dragOffset(node.id).x} ${box.y + dragOffset(node.id).y})`"
      @pointerdown="onNodePointerDown($event, node.id)"
      @click="onNodeClick($event, node.id)"
    >
      <rect
        :width="box.w"
        :height="box.h"
        :rx="box.h / 2"
        :fill="fillOf(node)"
        :stroke="isDropTarget(node.id) ? '#006EDB' : colorOf(node)"
        :stroke-width="isSelected(node.id) || isDropTarget(node.id) ? 3 : isRoot(props.mindmap, node.id) ? 2.5 : 1.8"
      />

      <!-- Marker color dot + icon (M5). -->
      <circle
        v-if="node.marker && node.marker.colorDot"
        :cx="16" :cy="box.h / 2" r="5" :fill="node.marker.colorDot"
      />
      <foreignObject
        v-if="node.marker && node.marker.icon"
        :x="node.marker.colorDot ? 24 : 10" :y="box.h / 2 - 8" width="16" height="16"
      >
        <div style="display: flex; align-items: center; justify-content: center">
          <FeatherIcon :name="node.marker.icon" :style="{ width: '13px', height: '13px', color: colorOf(node) }" />
        </div>
      </foreignObject>

      <!-- Node text: static label or an inline contentEditable while editing. -->
      <template v-if="!isEditing(node.id)">
        <text
          :x="box.w / 2"
          :y="box.h / 2"
          text-anchor="middle"
          dominant-baseline="central"
          :font-size="node.fontSize || (isRoot(props.mindmap, node.id) ? 17 : 14)"
          :font-weight="isRoot(props.mindmap, node.id) ? 700 : 500"
          :fill="node.text ? inkOf(node) : '#9AA5B1'"
          style="font-family: Inter, sans-serif; pointer-events: none"
          @dblclick="startEdit($event, node.id)"
        >
          {{ node.text || 'New idea' }}
        </text>
        <!-- Transparent hit-rect for double-click-to-edit over the whole pill. -->
        <rect
          :width="box.w" :height="box.h" :rx="box.h / 2" fill="transparent"
          style="cursor: text"
          @dblclick="startEdit($event, node.id)"
        />
      </template>
      <foreignObject v-else :x="6" :y="0" :width="box.w - 12" :height="box.h">
        <div
          :ref="(el) => (editFields[node.id] = el)"
          contenteditable="true"
          class="fd-mm-edit"
          :style="editStyle(node, box)"
          @keydown="onEditKeydown($event, node.id)"
          @paste="onPaste($event, node.id)"
          @blur="commitText(node.id)"
          @pointerdown.stop
        >{{ node.text }}</div>
      </foreignObject>

      <!-- Collapse/expand toggle + hidden-descendant count badge (M4). -->
      <g
        v-if="hasChildren(node.id)"
        :transform="`translate(${box.w + 2} ${box.h / 2})`"
        style="cursor: pointer"
        @click="toggleCollapse($event, node.id)"
        @pointerdown.stop
      >
        <circle r="9" fill="#FFFFFF" :stroke="colorOf(node)" stroke-width="1.5" />
        <path
          v-if="!node.collapsed"
          d="M-4 0 H4" :stroke="colorOf(node)" stroke-width="1.6" stroke-linecap="round"
        />
        <text
          v-else text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="700"
          :fill="colorOf(node)" style="font-family: Inter, sans-serif"
        >{{ childCount(node.id) }}</text>
      </g>

      <!-- Hover a node's edge: a dashed ghost node appears on the branch side;
           clicking it adds a child there (mouse affordance alongside Tab). -->
      <template v-if="!node.collapsed">
      <g
        v-for="ghost in ghostsFor(node, box)"
        :key="`add-${ghost.side}`"
        class="fd-mm-add"
        style="cursor: pointer; opacity: 0; transition: opacity 120ms ease"
        @click.stop="addChild($event, node.id)"
        @pointerdown.stop
      >
        <line
          :x1="ghost.line.x1" :y1="ghost.line.y1" :x2="ghost.line.x2" :y2="ghost.line.y2"
          stroke="#9AA5B1" stroke-width="1.5" stroke-dasharray="3 3"
        />
        <rect
          :x="ghost.rect.x" :y="ghost.rect.y" :width="ghost.rect.w" :height="ghost.rect.h"
          :rx="ghost.rect.h / 2" fill="#F5F8FF" stroke="#006EDB" stroke-width="1.5" stroke-dasharray="4 4"
        />
        <path
          :d="`M${ghost.cx - 5} ${ghost.cy} H${ghost.cx + 5} M${ghost.cx} ${ghost.cy - 5} V${ghost.cy + 5}`"
          stroke="#006EDB" stroke-width="1.8" stroke-linecap="round"
        />
      </g>
      </template>

      <!-- Note indicator (hover shows the note text, M5). -->
      <g v-if="node.note" :transform="`translate(${box.w - 12} 10)`">
        <title>{{ node.note }}</title>
        <circle r="4" fill="#FBCC55" />
      </g>
    </g>
  </g>
</template>

<style scoped>
.fd-mm-node:hover .fd-mm-add {
  opacity: 1;
}
.fd-mm-edit {
  display: block;
  text-align: center;
  white-space: nowrap;
  font-family: Inter, sans-serif;
  outline: none;
  overflow: hidden;
}
</style>
