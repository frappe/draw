// Native clipboard paste on the canvas (spec 2.6). A single window 'paste'
// listener owns Cmd/Ctrl+V (the keyboard composable no longer maps 'v', so there
// is no double-paste): if the OS clipboard holds an image we drop it on the
// canvas; otherwise we fall back to the app's internal shape/connector buffer.
// Pasting into a focused text field is left to the browser.

import { onMounted, onBeforeUnmount } from 'vue'

export function useCanvasPaste({ imageInsert, clipboard, getCenter }) {
  const onPaste = (event) => handlePaste(event, imageInsert, clipboard, getCenter)
  onMounted(() => window.addEventListener('paste', onPaste))
  onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
}

function handlePaste(event, imageInsert, clipboard, getCenter) {
  if (isEditingText(event.target)) return // let the field paste text normally
  const file = imageFileFrom(event.clipboardData)
  if (file) {
    event.preventDefault()
    imageInsert.insert(file, getCenter())
    return
  }
  if (clipboard.hasContent()) {
    event.preventDefault()
    clipboard.paste()
  }
}

// First image found among the clipboard items, as a File, or null.
function imageFileFrom(clipboardData) {
  for (const item of clipboardData?.items || []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

function isEditingText(target) {
  if (!target) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA'
}
