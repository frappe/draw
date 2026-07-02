<script setup>
// Outline side panel (spec A7, step M6). An indented, editable projection of the
// SAME tree model — there is no second source of truth. Edits dispatch store
// mutations (debounced text writes) and the map re-derives; the map's edits flow
// back here because both read store.state.mindmap, so the two stay in two-way
// sync without a reactive loop (Part G10). Rendered as a Teleport overlay so it
// can live as a side panel without editing the shared EditorShell layout.
import { computed, ref } from 'vue'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { childrenOf, isRoot } from '@/diagram/mindmapModel.js'
import { mindmapUi, selectNode, selectedNodeId, beginEdit } from '@/stores/mindmapUi.js'
import { deleteNode, promoteNode } from '@/diagram/mindmapOperations.js'

const store = useDiagramStore()
const pendingWrites = new Map() // nodeId -> timeout, for debounced text commits

// Depth-first flattening of the tree into rows the outline lists in order. Each
// row carries its indent depth so the list reads like a nested outline.
const rows = computed(() => {
  const model = store.state.mindmap
  if (!model) return []
  const out = []
  const walk = (id, depth) => {
    const node = model.nodes.find((candidate) => candidate.id === id)
    if (!node) return
    out.push({ id, depth, text: node.text })
    for (const child of childrenOf(model, id)) walk(child.id, depth + 1)
  }
  walk(model.rootId, 0)
  return out
})

// Debounced write so rapid typing produces one commit per pause, not per
// keystroke (Part G10/G11 — does not fight autosave or flood history).
function onInput(id, event) {
  const text = event.target.value
  if (pendingWrites.has(id)) clearTimeout(pendingWrites.get(id))
  pendingWrites.set(
    id,
    setTimeout(() => {
      store.updateNode(id, { text })
      pendingWrites.delete(id)
    }, 350),
  )
}

function onRowKeydown(id, event) {
  if (event.key === 'Enter') return createSibling(id, event)
  if (event.key === 'Tab') return outdentOrIndent(id, event)
}

function createSibling(id, event) {
  event.preventDefault()
  const model = store.state.mindmap
  const newId = isRoot(model, id) ? store.addChildNode(id) : store.addSiblingNode(id)
  focusRow(newId)
}

// Shift+Tab promotes (outdent); Tab adds a child (indent) of this node.
function outdentOrIndent(id, event) {
  event.preventDefault()
  if (event.shiftKey) {
    promoteNode(store, id)
    selectNode(store, id)
  } else {
    focusRow(store.addChildNode(id))
  }
}

function focusRow(id) {
  if (!id) return
  selectNode(store, id)
  beginEdit(id)
}

function onFocus(id) {
  selectNode(store, id)
}

function removeRow(id) {
  const model = store.state.mindmap
  if (isRoot(model, id)) return
  deleteNode(store, id)
}

function isActive(id) {
  return selectedNodeId(store) === id
}
</script>

<template>
  <Teleport to="body">
    <aside
      v-if="mindmapUi.outlineVisible && store.state.mindmap"
      class="fixed left-0 top-[57px] z-20 flex h-[calc(100vh-57px)] w-[280px] flex-col border-r border-outline-gray-1 bg-surface-base shadow-lg"
    >
      <header class="flex items-center justify-between border-b border-outline-gray-1 px-3.5 py-2.5">
        <span class="text-sm font-semibold text-ink-gray-9">Outline</span>
        <button class="text-ink-gray-5 hover:text-ink-gray-9" @click="mindmapUi.outlineVisible = false">
          <LucideIcon name="x" class="h-4 w-4" />
        </button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto py-1">
        <div
          v-for="row in rows"
          :key="row.id"
          class="group flex items-center gap-1 px-2 py-0.5"
          :class="{ 'bg-blue-50': isActive(row.id) }"
          :style="{ paddingLeft: 8 + row.depth * 16 + 'px' }"
        >
          <span class="text-ink-gray-4">•</span>
          <input
            class="min-w-0 flex-1 bg-transparent py-0.5 text-[13px] text-ink-gray-8 outline-none"
            :value="row.text"
            :placeholder="row.depth === 0 ? 'Central idea' : 'New idea'"
            @input="onInput(row.id, $event)"
            @focus="onFocus(row.id)"
            @keydown="onRowKeydown(row.id, $event)"
          />
          <button
            v-if="row.depth > 0"
            class="opacity-0 group-hover:opacity-100"
            @click="removeRow(row.id)"
          >
            <LucideIcon name="trash-2" class="h-3 w-3 text-ink-gray-4 hover:text-red-600" />
          </button>
        </div>
      </div>
      <footer class="border-t border-outline-gray-1 px-3.5 py-2 text-[11px] text-ink-gray-5">
        Enter: sibling · Tab: child · Shift+Tab: promote
      </footer>
    </aside>
  </Teleport>
</template>
