// Menu model for the editor "…" overflow (#111). A plain builder — not inline in
// the SFC — so the item set (labels, icons, the Favourite/Unpin toggle, the red
// Delete) can be unit-tested without mounting the toolbar. Shape matches frappe-ui
// Dropdown's `options`: { label, icon, onClick, theme? }.
//
// "Move …" moves the diagram into a Frappe Drive folder (#105); it appears only when
// Drive is available (`driveAvailable`), since there are no folders to move into
// otherwise. Backed by draw/api/drive_integration.py + MoveToDriveDialog.vue.
//
// Still NOT built — slots in when its backing lands:
//   • Version history … needs a stored revision history (unbuilt)

export function overflowMenuItems({
  isPinned,
  driveAvailable = false,
  onRename,
  onShowInfo,
  onMove,
  onTogglePin,
  onDelete,
}) {
  return [
    { label: 'Rename', icon: 'edit-2', onClick: onRename },
    { label: 'Show info', icon: 'file-text', onClick: onShowInfo },
    // Only offer Move when there's a Drive to move into.
    ...(driveAvailable ? [{ label: 'Move', icon: 'folder', onClick: onMove }] : []),
    // "Favourite" reads as the action when unpinned; "Unpin" as the action to undo it.
    { label: isPinned ? 'Unpin' : 'Favourite', icon: 'pin', onClick: onTogglePin },
    { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: onDelete },
  ]
}
