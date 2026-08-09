// Which type's editing CHROME the current selection belongs to (#359).
//
// This used to be a computed inside EditorShell, where it could not be unit
// tested — EditorShell does not mount in the node env. It lives here now because
// the static canvas toolbar and the (still floating) selection editors must
// agree on one answer: two sources would let the visible controls and the
// working keyboard disagree.
//
// Created once per editor and provided, like the store and the editor UI. A
// component cannot inject what it provides, so EditorShell keeps the returned
// object and children call useSelectionContext().

import { computed, provide, inject } from 'vue'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { isMindmapShape, isFlowchartShape } from '@/diagram/freeFloating.js'
import { keyboardOwner } from '@/composables/useKeyboard.js'

const CONTEXT_KEY = 'selectionContext'

export function createSelectionContext(store, whiteboardUi, modeStrategy) {
  const chromeType = computed(() =>
    resolveChromeType(store, whiteboardUi, modeStrategy.value.type),
  )
  return { chromeType }
}

export function provideSelectionContext(context) {
  provide(CONTEXT_KEY, context)
  return context
}

export function useSelectionContext() {
  return inject(CONTEXT_KEY)
}

// The rule, exported for tests. Every branch below exists because the obvious
// version broke something specific:
//
// - A single-type document always uses its own chrome. Only the unified canvas
//   mixes models, so only it has to choose.
// - The whiteboard wins on a unified document. Its editor carries the only
//   Delete a line, table or stroke has, so gating it on the strategy (which
//   falls back to block) left those objects placeable but unremovable by mouse.
// - A migrated free-floating mind-map or flowchart node (#122) is an ordinary
//   block shape. It OWNS the mind-map / flowchart keyboard, but its chrome is
//   the BLOCK editor, which is what actually edits the shape. The framed
//   overlays read the now-empty sub-model and would show their blank-map prompt.
// - Otherwise the chrome follows whichever model holds the selection — the same
//   rule the keyboard uses (#45), so the two can never disagree.
export function resolveChromeType(store, whiteboardUi, strategyType) {
  if (!isUnifiedDocument(store.state)) return strategyType
  if (whiteboardUi.state.selection.length) return 'whiteboard'
  const selectedId = store.state.selection?.[0]
  const shape = selectedId && store.state.shapes?.find((s) => s.id === selectedId)
  if (isMindmapShape(shape) || isFlowchartShape(shape)) return 'block'
  return keyboardOwner(store) || 'block'
}
