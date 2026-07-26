// Small DOM predicates shared by the global key/paste handlers.

// Is the event target a text-entry surface? Global shortcuts and canvas paste
// must both bow out while the user is typing — into a shape's contenteditable
// text, a title field, or any input/textarea in the chrome — so Delete, arrow
// keys and Ctrl-V reach the caret instead of the canvas.
export function isEditingText(target) {
  if (!target) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA'
}
