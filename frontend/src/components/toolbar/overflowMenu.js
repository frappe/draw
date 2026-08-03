// Menu model for the editor "…" overflow (#111). A plain builder — not inline in
// the SFC — so the item set (labels, icons, the Favourite/Unpin toggle, the red
// Delete) can be unit-tested without mounting the toolbar. Shape matches frappe-ui
// Dropdown's `options`: { label, icon, onClick, theme? }.
//
// Deliberately NOT built yet — they slot in when their backing lands:
//   • Move …            needs Frappe Drive folders (draw/api/drive_integration.py)
//   • Version history … needs a stored revision history (unbuilt)

export function overflowMenuItems({ isPinned, onRename, onShowInfo, onTogglePin, onDelete }) {
  return [
    { label: 'Rename', icon: 'edit-2', onClick: onRename },
    { label: 'Show info', icon: 'file-text', onClick: onShowInfo },
    // "Favourite" reads as the action when unpinned; "Unpin" as the action to undo it.
    { label: isPinned ? 'Unpin' : 'Favourite', icon: 'pin', onClick: onTogglePin },
    { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: onDelete },
  ]
}
