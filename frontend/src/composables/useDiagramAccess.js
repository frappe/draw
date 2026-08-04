// Whether the diagram the editor was asked to open actually loaded (#173):
// 'loading' | 'ready' | 'denied'. EditorPage renders the editor only for 'ready',
// so a 403/404 can no longer fall through to an empty, editable document.
//
// The FIRST resolution decides and then latches. The document resource is shared
// with the share menu and reloaded after a share change (useShare), and a
// document resource sets `doc` back to null whenever any load fails — so without
// the latch one transient reload failure would tear a live editor, and its
// unsaved edits, off the screen.

import { ref, watch } from 'vue'

export function useDiagramAccess(resource) {
  const access = ref('loading')
  watch(
    () => loadState(resource),
    (state) => {
      if (access.value === 'loading') access.value = state
    },
    { immediate: true },
  )
  return access
}

function loadState(resource) {
  if (resource?.doc) return 'ready'
  if (resource?.get?.error) return 'denied'
  return 'loading'
}
