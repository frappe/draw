// The mind-map derivations the toolbar groups share (#362), for a LEGACY
// single-type mind map whose nodes still live in the sub-model. A migrated
// free-floating node is an ordinary block shape and uses useBlockSelection.
//
// Memoised per store, the way useSmartGuides and useBlockSelection are: four
// groups read this and each would otherwise re-resolve the selection against
// the node list on every change.

import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { isRoot, rootNodes } from '@/diagram/mindmapModel.js'
import { resolveNodeColor, nodeFill } from '@/diagram/mindmapColors.js'

const instances = new WeakMap()

export function useMindmapSelection() {
  const store = useDiagramStore()
  if (!instances.has(store)) instances.set(store, createMindmapSelection(store))
  return instances.get(store)
}

function createMindmapSelection(store) {
  const model = computed(() => store.state.mindmap)
  const nodes = computed(() =>
    (store.state.selection || [])
      .map((id) => model.value?.nodes.find((node) => node.id === id))
      .filter(Boolean),
  )
  const multi = computed(() => nodes.value.length > 1)
  // Per-node controls (marks, shape, size, marker, cross-link) only make sense
  // for a lone selection, so `node` is null while multi-selecting.
  const node = computed(() => (nodes.value.length === 1 ? nodes.value[0] : null))
  const selectedIsRoot = computed(() => node.value && isRoot(model.value, node.value.id))
  const hasNonRootSelected = computed(() =>
    nodes.value.some((n) => !isRoot(model.value, n.id)),
  )
  // A root becomes deletable once the canvas holds more than one tree — deleting
  // it then removes just that mind map (#48), not every map on the canvas.
  const canDelete = computed(
    () => hasNonRootSelected.value || rootNodes(model.value).length > 1,
  )

  // The swatch previews mirror what MindMapNodeLayer actually renders, so an
  // uncoloured node shows its resolved branch tint rather than a fixed constant
  // and the toolbar dots match the node on the canvas.
  const fillPreview = computed(() => {
    const first = nodes.value[0]
    if (!first) return '#FFFFFF'
    if (first.fill) return first.fill
    if (first.color) return nodeFill(first.color)
    return isRoot(model.value, first.id)
      ? '#F3F3F3'
      : nodeFill(resolveNodeColor(model.value, first, store.state.themePreset))
  })
  const branchPreview = computed(() => {
    const first = nodes.value[0]
    return first ? resolveNodeColor(model.value, first, store.state.themePreset) : '#4F94FF'
  })
  const borderPreview = computed(() => {
    const first = nodes.value[0]
    if (!first) return '#7C7C7C'
    return first.border || resolveNodeColor(model.value, first, store.state.themePreset)
  })

  return {
    store,
    model,
    nodes,
    node,
    multi,
    selectedIsRoot,
    hasNonRootSelected,
    canDelete,
    fillPreview,
    branchPreview,
    borderPreview,
  }
}
