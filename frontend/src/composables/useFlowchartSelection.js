// The flowchart derivations the toolbar groups share (#362), for a LEGACY
// single-type flowchart whose nodes still live in the sub-model. A migrated
// free-floating node is an ordinary block shape and uses useBlockSelection.
//
// Memoised per store, matching useBlockSelection and useMindmapSelection.

import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { flowchartNodeById } from '@/diagram/flowchartModel.js'

const instances = new WeakMap()

export function useFlowchartSelection() {
  const store = useDiagramStore()
  if (!instances.has(store)) instances.set(store, createFlowchartSelection(store))
  return instances.get(store)
}

function createFlowchartSelection(store) {
  const model = computed(() => store.state.flowchart)
  // Fill, border, text and delete act on every selected node.
  const nodes = computed(() =>
    (store.state.selection || [])
      .map((id) => flowchartNodeById(model.value, id))
      .filter(Boolean),
  )
  // Type swap and the decision branches only make sense for a lone selection.
  const node = computed(() => (nodes.value.length === 1 ? nodes.value[0] : null))
  const fillPreview = computed(() => nodes.value[0]?.fill || '#FFFFFF')
  const borderPreview = computed(() => nodes.value[0]?.border || '#7C7C7C')
  const textStyle = computed(() => node.value?.textStyle || {})

  // Every write is one undoable unit across the whole selection (Part G6).
  function updateSelectedNodes(label, patch) {
    const ids = nodes.value.map((n) => n.id)
    if (!ids.length) return
    store.updateFlowchartModel(label, (draft) => {
      for (const id of ids) {
        const target = flowchartNodeById(draft, id)
        if (target) patch(target)
      }
    })
  }

  return { store, model, nodes, node, fillPreview, borderPreview, textStyle, updateSelectedNodes }
}
