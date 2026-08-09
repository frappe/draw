// The block-model derivations that every toolbar group for a shape selection
// needs (#361).
//
// BlockSelectionEditor worked these out once for its whole floating bar. The
// groups that replaced it would each re-derive them, and any drift between two
// copies shows up as one group appearing while its neighbour does not, so they
// live here instead.

import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { activeEditor } from '@/composables/useRichText.js'

// One instance per store, the same way useSmartGuides memoises. Five groups read
// this, and `shapes` resolves every selected id against the shape list, so five
// independent copies would redo that work five times on each selection change.
const instances = new WeakMap()

export function useBlockSelection() {
  const store = useDiagramStore()
  if (!instances.has(store)) instances.set(store, createBlockSelection(store))
  return instances.get(store)
}

function createBlockSelection(store) {
  const selection = computed(() => store.state.selection || [])
  const shapes = computed(() => selection.value.map((id) => store.shapeById(id)).filter(Boolean))
  const shapeIds = computed(() => shapes.value.map((shape) => shape.id))
  const count = computed(() => selection.value.length)
  const hasShapes = computed(() => shapes.value.length > 0)
  // A lone selected connector gets its line controls instead of shape controls.
  const connector = computed(() =>
    count.value === 1 ? store.connectorById(selection.value[0]) || null : null,
  )
  // Align and distribute act BETWEEN shapes, so they only apply to a
  // multi-selection — a lone shape must not open an empty menu.
  const multi = computed(() => shapes.value.length >= 2)
  // While a shape's label is being edited the bar becomes a text-only menu
  // (#259): the shape-level controls hide, because you are editing the label,
  // not the shape.
  const editing = computed(() => Boolean(activeEditor.value))

  return { store, selection, shapes, shapeIds, count, hasShapes, connector, multi, editing }
}
