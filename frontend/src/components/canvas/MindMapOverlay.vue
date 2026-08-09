<script setup>
// What is left of the mind map's canvas chrome once its contextual toolbar moved
// onto the static canvas toolbar (#362):
//
//   - the focus-mode banner,
//   - the blank-map "Add your first idea" prompt,
//   - the confirm dialog for deleting a node that has sub-branches.
//
// Mounted once per editor (EditorShell) inside <main>, so the banner positions
// against the canvas area rather than the window.
import { computed } from 'vue'
import { Dialog, Button } from 'frappe-ui'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { deleteNodes, deleteTrees, clearMindmap } from '@/diagram/mindmapOperations.js'
import { mindmapUi, selectNode, beginEdit, toggleFocus, focusedNodeId } from '@/stores/mindmapUi.js'

const store = useDiagramStore()

const model = computed(() => store.state.mindmap)
const isBlank = computed(() => (model.value?.nodes.length ?? 0) === 0)

// Focus counts as on only while the focused node still exists — the same guard
// the node layer applies, so the banner can never claim a focus that dims
// nothing.
const isFocused = computed(() => !!focusedNodeId(model.value))

// The banner is deliberately NOT part of the contextual toolbar. That only shows
// while a node is selected, so putting the way out of focus mode there would
// strand anyone who cleared the selection while a branch was isolated.
function exitFocus() {
  toggleFocus(store)
}

// The layout places the first idea at the map's origin, which is inside the
// freshly-opened viewport, so the camera is deliberately left alone (#119: no
// insert may pan the canvas). The node is selected and opened for editing.
function addFirstIdea() {
  const id = store.addRootNode('')
  if (!id) return
  selectNode(store, id)
  beginEdit(id)
}

function confirmDeleteNodes() {
  const pending = mindmapUi.confirmDelete
  if (!pending) return
  if (pending.clearAll) {
    clearMindmap(store)
    selectNode(store, null)
  } else if (pending.trees) {
    // One of several independent maps on the canvas (#48) — drop that tree only.
    deleteTrees(store, pending.trees)
    selectNode(store, null)
  } else {
    const first = model.value?.nodes.find((node) => node.id === pending.ids[0])
    selectNode(store, first?.parentId || null)
    deleteNodes(store, pending.ids)
  }
  mindmapUi.confirmDelete = null
}
</script>

<template>
  <!-- Focus banner, pinned to the top of the canvas area. It used to be a
       body-level fixed element at top-3, which is where the canvas toolbar sits
       now; positioned against <main> instead it clears both bars without
       hard-coding either height. -->
  <div
    v-if="isFocused"
    class="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-outline-gray-2 bg-surface-base py-1 pl-3 pr-1 shadow-lg"
  >
    <span class="text-sm text-ink-gray-7">Focusing one branch</span>
    <Button variant="subtle" size="sm" @click="exitFocus">Exit</Button>
  </div>

  <!-- Blank map: one inviting prompt to add the first idea. -->
  <button
    v-if="isBlank"
    aria-label="Add your first idea"
    class="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-dashed border-outline-gray-3 bg-surface-base px-5 py-3 text-base font-medium text-ink-gray-7 shadow-sm hover:border-outline-gray-8 hover:text-ink-gray-9"
    @click="addFirstIdea"
  >
    <span class="lucide-plus h-4 w-4" aria-hidden="true" /> Add your first idea
  </button>

  <!-- In-product confirm for deleting nodes that have sub-branches (replaces the
       native browser confirm). -->
  <Dialog
    :open="!!mindmapUi.confirmDelete"
    title="Delete nodes"
    @update:open="(open) => { if (!open) mindmapUi.confirmDelete = null }"
  >
    <template #default>
      <p class="text-base text-ink-gray-7">{{ mindmapUi.confirmDelete?.label }}</p>
    </template>
    <template #actions>
      <Button variant="solid" theme="red" @click="confirmDeleteNodes">Delete</Button>
      <Button @click="mindmapUi.confirmDelete = null">Cancel</Button>
    </template>
  </Dialog>
</template>
