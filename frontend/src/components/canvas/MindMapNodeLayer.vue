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
import LucideIcon from '@/icons/LucideIcon.vue'
import {
  branchPath,
  isNodeHidden,
  hiddenDescendantCount,
  PAD_X,
  LINE_H,
} from '@/diagram/mindmapLayout.js'
import { resolveNodeColor, nodeFill, readableInk } from '@/diagram/mindmapColors.js'
import { isRoot, subtreeIds } from '@/diagram/mindmapModel.js'
import { toggleNodeCollapsed, pasteOutline, linkNodes } from '@/diagram/mindmapOperations.js'
import { looksLikeOutline } from '@/diagram/mindmapPaste.js'
import { useMindmapInteraction } from '@/composables/useMindmapInteraction.js'
import { isAdditiveEvent } from '@/composables/pointer.js'
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
// The node's text as editing began, so a commit records one undoable unit even
// though we mutate node.text live (for the grow-as-you-type box).
const editStartText = ref({})
// Keep the marquee's stroke crisp regardless of zoom (it lives in canvas units).
const zoom = computed(() => editorUi.viewport.state.zoom || 1)

function box(id) {
  return props.positions[id]
}

// Whenever a node enters edit mode (via keyboard create or palette), move focus
// into its field and select its text, after Vue mounts the foreignObject.
watch(
  () => mindmapUi.editingId,
  (id) => {
    if (id) {
      const node = props.mindmap.nodes.find((candidate) => candidate.id === id)
      editStartText.value[id] = node ? node.text : ''
      nextTick(() => focusField(id))
    }
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
      dash: LINK_DASH[node.linkDash] || null,
    })),
)
// Connector line style per node (applies to the branch coming INTO it).
const LINK_DASH = { solid: null, dashed: '7 5', dotted: '1.5 5' }

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
  // An explicit fill wins; otherwise the fill is a light tint of the branch
  // colour (the root has its own neutral tint).
  if (node.fill) return node.fill
  return node.color ? nodeFill(node.color) : isRoot(props.mindmap, node.id) ? '#F3F3F3' : nodeFill(colorOf(node))
}

function inkOf(node) {
  return readableInk(fillOf(node))
}

// Highlight every node in the shared selection (multi-select), not just the lone
// keyboard-navigation node — the selected visual applies to all of them (Part C).
function isSelected(id) {
  return store.state.selection.includes(id)
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

// --- add-a-child affordance (clear circular + button, Whimsical-style) -------
// A solid, obvious "+" circle sits just off the node's branch side and is shown
// while the node is hovered or selected — replacing the old dashed ghost that
// was easy to miss (and the confusing double-click-on-empty). Click it to add a
// child on that side and start typing.
const ADD_R = 11
const ADD_OFFSET = 28 // gap from the node edge to the "+" centre (clears the collapse "−")
const hoveredId = ref(null)

function rootCenterX() {
  const root = box(props.mindmap.rootId)
  return root ? root.x + root.w / 2 : 0
}

// The single branch side a node grows on (root defaults to right for its own
// collapse toggle). The collapse "−" and add "+" both live on this side, so on a
// left-hand branch they sit at the node's LEFT end, mirroring the right.
function branchSideOf(node, b) {
  if (isRoot(props.mindmap, node.id)) return 'right'
  return b.x + b.w / 2 >= rootCenterX() ? 'right' : 'left'
}

// The branch side(s) a node grows on: the root grows both ways; any other node
// grows on the side it already sits relative to the root.
function addSidesFor(node, b) {
  if (isRoot(props.mindmap, node.id)) return ['right', 'left']
  return [b.x + b.w / 2 >= rootCenterX() ? 'right' : 'left']
}

// Circular add-button geometry per side, in node-local coordinates.
function addButtonsFor(node, b) {
  return addSidesFor(node, b).map((side) => {
    const cx = side === 'right' ? b.w + ADD_OFFSET : -ADD_OFFSET
    return { side, cx, cy: b.h / 2, stubX1: side === 'right' ? b.w : 0 }
  })
}

// A second "+" just below the child button, at the same branch end, that adds a
// parallel node at the same level (a sibling). The root has no siblings, so its
// parallel "+" adds another top-level branch instead. One button (the node's
// branch side; the root uses its right side).
const SIB_DY = ADD_R * 2 + 6
function siblingButtonsFor(node, b) {
  const btns = addButtonsFor(node, b)
  return btns.length ? [{ ...btns[0], cy: b.h / 2 + SIB_DY }] : []
}
function addSibling(event, nodeId, side = null) {
  // The lower "+" adds another node at the CHILD level of this node (a second
  // child, parallel to the first) — not a sibling of the node itself.
  startEdit(event, store.addChildNode(nodeId, side))
}

// Add buttons show ONLY while the node (and the zone around its branch end,
// see hoverPad) is hovered, or it's the lone selection — never always-on.
function showAdd(node) {
  if (node.collapsed || interaction.drag.active) return false
  const singleSelected = store.state.selection.length === 1 && isSelected(node.id)
  return singleSelected || hoveredId.value === node.id
}
function addProminent() {
  return true // only rendered when relevant, so always full strength
}

// An invisible hit-pad that extends the node's hover region out to (and a little
// past) its "+" buttons, so moving the pointer from the node to a button keeps
// them visible instead of them vanishing in the gap.
const HOVER_OUT = ADD_OFFSET + ADD_R + 12
function hoverPad(node, b) {
  const root = isRoot(props.mindmap, node.id)
  const side = branchSideOf(node, b)
  const left = root || side === 'left' ? HOVER_OUT : 6
  const right = root || side === 'right' ? HOVER_OUT : 6
  return { x: -left, y: -8, w: b.w + left + right, h: b.h + SIB_DY + ADD_R + 14 }
}

function addChild(event, parentId, side = null) {
  startEdit(event, store.addChildNode(parentId, side))
}

function nodeFontSize(node) {
  return node.fontSize || (isRoot(props.mindmap, node.id) ? 17 : 14)
}

// Shared text style for the static label and the inline editor: the same font,
// weight and wrapped line-height, so what you read is exactly what you edit and
// both wrap identically to how the layout measured the box. Line-height tracks
// LINE_H (the layout's per-line height), scaled to the node's font size.
function textStyle(node) {
  const fontSize = nodeFontSize(node)
  return {
    fontSize: fontSize + 'px',
    lineHeight: (LINE_H * fontSize) / 14 + 'px',
    fontWeight: node.bold ? 700 : isRoot(props.mindmap, node.id) ? 600 : 500,
    fontStyle: node.italic ? 'italic' : 'normal',
    textDecoration: node.strike ? 'line-through' : 'none',
    color: inkOf(node),
  }
}

// The text box insets by half the layout's horizontal padding on each side, so
// the wrap width equals the width the layout measured against (PAD_X total).
const TEXT_INSET = PAD_X / 2

function surfaceRect(event) {
  const surface = event.target.closest('[data-fdpreset]')
  return surface ? surface.getBoundingClientRect() : { left: 0, top: 0 }
}

// Whether this node was the sole selection BEFORE the current press — captured on
// pointerdown (which then selects it), so the click can tell a first click
// (select) from a second click on an already-selected node (edit) — the Whimsical
// model (N5).
const pressSelectedId = ref(null)

// Pointer down on a node: cross-link mode wires two nodes; an additive modifier
// toggles the node in the shared selection (bulk-select, no drag); otherwise
// select + begin a possible drag-to-reparent (the composable thresholds it).
function onNodePointerDown(event, id) {
  event.stopPropagation()
  if (mindmapUi.pendingLinkSource) return finishLink(id)
  if (isAdditiveEvent(event)) return store.toggleInSelection(id)
  pressSelectedId.value = selectedNodeId(store)
  interaction.startDrag(event, id, surfaceRect(event))
}

function finishLink(id) {
  linkNodes(store, mindmapUi.pendingLinkSource, id)
  mindmapUi.pendingLinkSource = null
}

// N5 click model: first click selects; clicking the already-selected node again
// drops the text cursor in. A drag (reparent) is not a click, so it never edits.
// Double-click (startEdit) still selects+edits immediately.
function onNodeClick(event, id) {
  event.stopPropagation()
  if (isAdditiveEvent(event)) return
  if (interaction.gesture.moved) return
  if (pressSelectedId.value === id && mindmapUi.editingId !== id) {
    beginEdit(id)
    selectNode(store, id)
    nextTick(() => focusField(id))
    return
  }
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
  // Seed the editable's text imperatively (the template leaves it empty) so
  // reactive re-renders never reset the caret; then focus + select all.
  const node = props.mindmap.nodes.find((candidate) => candidate.id === id)
  const text = node ? node.text : ''
  if (field.innerText !== text) field.textContent = text
  field.focus()
  const range = document.createRange()
  range.selectNodeContents(field)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// Grow the pill live as the user types: mutate node.text directly (no history)
// so the reactive layout re-measures and the box expands/wraps in real time.
// The real, undoable commit happens on blur/Tab/Enter (commitText / create).
function onEditInput(id) {
  const field = editFields.value[id]
  const node = props.mindmap.nodes.find((candidate) => candidate.id === id)
  if (field && node) node.text = field.innerText
}

// Commit edited text back to the model on blur (one undoable update). Because we
// mutate node.text live while typing, we first rewind it to the pre-edit value
// so the history snapshot captures the change as a single undoable unit. Only
// clear the editing flag if THIS node is still the one being edited — a Tab/Enter
// create has already moved editing to the new node, and we must not clobber it.
function commitText(id) {
  const field = editFields.value[id]
  const node = props.mindmap.nodes.find((candidate) => candidate.id === id)
  const text = field ? field.innerText.trim() : node?.text
  const original = editStartText.value[id] ?? node?.text
  if (node) {
    if (text !== original) {
      node.text = original // rewind so updateNode's snapshot has the old text
      store.updateNode(id, { text })
    } else {
      node.text = original // no real change — keep model tidy after live edits
    }
  }
  delete editStartText.value[id]
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
// removes the new node in a single, coherent step.
function commitTextIfNeeded(event, id) {
  const creates = event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)
  if (!creates) return
  const field = editFields.value[id]
  const node = props.mindmap.nodes.find((candidate) => candidate.id === id)
  if (field && node) {
    node.text = field.innerText.trim()
    // Mark this text as already-persisted: the create moves editing to the new
    // node, and the old field's unmount @blur then runs commitText. Without this,
    // commitText would rewind + re-commit a SECOND "Update node" step, leaving the
    // undo history at two entries with a nonsensical middle state (empty parent,
    // child present). Aligning editStartText makes that blur a no-op.
    editStartText.value[id] = node.text
  }
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

// --- node shape (curated set; default pill) ---------------------------------
function nodeStroke(node) {
  // Thin resting borders (halved from the old 2.5/1.8); selection stays a touch
  // heavier as an affordance.
  if (isSelected(node.id) || isDropTarget(node.id)) return 2
  return isRoot(props.mindmap, node.id) ? 1.25 : 0.9
}
function strokeColor(node) {
  // Border is its own knob (U5/O2): an explicit node.border wins; otherwise the
  // outline follows the resolved branch/fill colour as before.
  if (isDropTarget(node.id)) return '#006EDB'
  return node.border || colorOf(node)
}
function nodeRx(node, b) {
  if (node.shape === 'rounded') return 12
  if (node.shape === 'rectangle') return 4
  return b.h / 2 // pill (default)
}
function nodePoly(node, b) {
  if (node.shape === 'diamond') return `${b.w / 2},0 ${b.w},${b.h / 2} ${b.w / 2},${b.h} 0,${b.h / 2}`
  const i = Math.min(b.w * 0.16, b.h / 2) // hexagon
  return `${i},0 ${b.w - i},0 ${b.w},${b.h / 2} ${b.w - i},${b.h} ${i},${b.h} 0,${b.h / 2}`
}
</script>

<template>
  <g>
    <!-- Transparent full-canvas backdrop BEHIND the nodes: catches empty-space
         presses to start a marquee (the canvas surface early-returns for mind
         maps, so the layer owns this). Nodes draw on top and stop propagation,
         so their own clicks/drags are unaffected. Sized huge so it always spans
         the viewport at any pan/zoom. -->
    <rect
      x="-200000"
      y="-200000"
      width="400000"
      height="400000"
      fill="transparent"
      @pointerdown="interaction.beginMarquee($event)"
    />

    <!-- Branch curves (no arrowheads, branch-colored) — spec A4/M3. -->
    <path
      v-for="link in links"
      :key="link.id"
      :d="link.d"
      fill="none"
      :stroke="link.color"
      stroke-width="2.5"
      stroke-linecap="round"
      :stroke-dasharray="link.dash"
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
      @pointerenter="hoveredId = node.id"
      @pointerleave="hoveredId === node.id && (hoveredId = null)"
    >
      <!-- Invisible pad extending the hover region out to the "+" buttons, so
           the buttons appear on hover-near and don't vanish while reaching them.
           Only active while this node is the hovered one (else it would swallow
           empty-canvas marquee presses near other nodes). -->
      <rect
        v-if="hoveredId === node.id"
        :x="hoverPad(node, box).x" :y="hoverPad(node, box).y"
        :width="hoverPad(node, box).w" :height="hoverPad(node, box).h"
        fill="transparent"
      />
      <ellipse
        v-if="node.shape === 'ellipse'"
        :cx="box.w / 2"
        :cy="box.h / 2"
        :rx="box.w / 2"
        :ry="box.h / 2"
        :fill="fillOf(node)"
        :stroke="strokeColor(node)"
        :stroke-width="nodeStroke(node)"
      />
      <polygon
        v-else-if="node.shape === 'diamond' || node.shape === 'hexagon'"
        :points="nodePoly(node, box)"
        :fill="fillOf(node)"
        :stroke="strokeColor(node)"
        :stroke-width="nodeStroke(node)"
      />
      <rect
        v-else
        :width="box.w"
        :height="box.h"
        :rx="nodeRx(node, box)"
        :fill="fillOf(node)"
        :stroke="strokeColor(node)"
        :stroke-width="nodeStroke(node)"
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
          <LucideIcon :name="node.marker.icon" :style="{ width: '13px', height: '13px', color: colorOf(node) }" />
        </div>
      </foreignObject>

      <!-- Node text: static label or an inline contentEditable while editing.
           Both are wrapping, vertically-centred divs inset to the layout's text
           width, so text wraps inside the pill (never overflows) and reads
           identically whether displayed or edited. -->
      <template v-if="!isEditing(node.id)">
        <foreignObject :x="TEXT_INSET" :y="0" :width="box.w - PAD_X" :height="box.h">
          <div class="fd-mm-textwrap">
            <div
              class="fd-mm-label"
              :style="[textStyle(node), node.text ? {} : { color: '#9AA5B1' }]"
            >{{ (node.emoji ? node.emoji + '  ' : '') + (node.text || 'New idea') }}</div>
          </div>
        </foreignObject>
        <!-- Transparent hit-rect for double-click-to-edit over the whole pill. -->
        <rect
          :width="box.w" :height="box.h" :rx="box.h / 2" fill="transparent"
          style="cursor: text"
          @dblclick="startEdit($event, node.id)"
        />
      </template>
      <foreignObject v-else :x="TEXT_INSET" :y="0" :width="box.w - PAD_X" :height="box.h">
        <div class="fd-mm-textwrap">
          <!-- Content is set imperatively in focusField (NOT interpolated), so the
               live `node.text` updates from @input (grow-as-you-type) never
               re-patch this editable's DOM — otherwise the caret jumps to the
               start and the text comes out reversed. -->
          <div
            :ref="(el) => (editFields[node.id] = el)"
            contenteditable="true"
            class="fd-mm-edit"
            :style="textStyle(node)"
            @input="onEditInput(node.id)"
            @keydown="onEditKeydown($event, node.id)"
            @paste="onPaste($event, node.id)"
            @blur="commitText(node.id)"
            @pointerdown.stop
          />
        </div>
      </foreignObject>

      <!-- Add "+" (child) on the branch side, just past the node end; and, on
           hover/select, a parallel "+" below it (same level / sibling). Rendered
           BEFORE the collapse toggle so the toggle sits cleanly on top of the
           short branch stub. -->
      <g
        v-for="add in showAdd(node) ? addButtonsFor(node, box) : []"
        :key="`add-${add.side}`"
        style="cursor: pointer; transition: opacity 120ms ease"
        :style="{ opacity: addProminent(node) ? 1 : 0.4 }"
        @click.stop="addChild($event, node.id, add.side)"
        @pointerdown.stop
        @pointerenter="hoveredId = node.id"
      >
        <title>Add child</title>
        <line
          :x1="add.stubX1" :y1="add.cy" :x2="add.cx" :y2="add.cy"
          :stroke="colorOf(node)" stroke-width="2" stroke-linecap="round"
        />
        <circle :cx="add.cx" :cy="add.cy" :r="ADD_R" :fill="colorOf(node)" />
        <path
          :d="`M${add.cx - 4.5} ${add.cy} H${add.cx + 4.5} M${add.cx} ${add.cy - 4.5} V${add.cy + 4.5}`"
          stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"
        />
      </g>

      <g
        v-for="sib in showAdd(node) ? siblingButtonsFor(node, box) : []"
        :key="`sib-${sib.side}`"
        style="cursor: pointer; transition: opacity 120ms ease"
        :style="{ opacity: addProminent(node) ? 1 : 0.4 }"
        @click.stop="addSibling($event, node.id, sib.side)"
        @pointerdown.stop
        @pointerenter="hoveredId = node.id"
      >
        <title>Add another child</title>
        <line
          :x1="sib.stubX1" :y1="box.h / 2" :x2="sib.cx" :y2="sib.cy"
          :stroke="colorOf(node)" stroke-width="2" stroke-linecap="round"
        />
        <circle :cx="sib.cx" :cy="sib.cy" :r="ADD_R" :fill="colorOf(node)" />
        <path
          :d="`M${sib.cx - 4.5} ${sib.cy} H${sib.cx + 4.5} M${sib.cx} ${sib.cy - 4.5} V${sib.cy + 4.5}`"
          stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"
        />
      </g>

      <!-- Collapse/expand toggle + hidden-descendant count badge (M4), at the
           node's branch end (mirrored for left-hand branches). -->
      <g
        v-if="hasChildren(node.id)"
        :transform="`translate(${branchSideOf(node, box) === 'right' ? box.w + 2 : -2} ${box.h / 2})`"
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
    </g>

    <!-- Live rubber-band marquee while dragging empty canvas (logical units). -->
    <rect
      v-if="interaction.marquee.box"
      :x="interaction.marquee.box.x"
      :y="interaction.marquee.box.y"
      :width="interaction.marquee.box.w"
      :height="interaction.marquee.box.h"
      fill="rgba(79,148,255,0.08)"
      stroke="#4F94FF"
      :stroke-width="1 / zoom"
      :stroke-dasharray="`${4 / zoom} ${3 / zoom}`"
      style="pointer-events: none"
    />
  </g>
</template>

<style scoped>
.fd-mm-node:hover .fd-mm-add {
  opacity: 1;
}
/* A flex wrapper does the vertical centring; the text element itself keeps a
   normal line box so an *empty* editable still shows its caret at line-height
   (centred), instead of collapsing to the top. */
.fd-mm-textwrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}
/* Static label and inline editor share wrapping so text always sits inside the
   pill and grows the box downward, never sideways past the layout's width cap. */
.fd-mm-label,
.fd-mm-edit {
  width: 100%;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-family: Inter, sans-serif;
}
.fd-mm-label {
  pointer-events: none;
}
.fd-mm-edit {
  outline: none;
}
</style>
