// Menu model for the editor "…" overflow (#111). A plain builder — not inline in
// the SFC — so the item set (labels, icons, the Pin/Unpin toggle, the red Delete)
// can be unit-tested without mounting the toolbar. Shape matches frappe-ui
// Dropdown's `options`: { label, icon, onClick, theme? }.
//
// "Move …" moves the diagram into a Frappe Drive folder (#105); it appears only when
// Drive is available (`driveAvailable`), since there are no folders to move into
// otherwise. Backed by draw/api/drive_integration.py + MoveToDriveDialog.vue.
//
// Rename is deliberately absent (#232). The title in the top bar is the one way to
// rename a diagram — click it and it becomes an input. A menu row that only jumped
// focus there was a second door onto the same edit.
//
// Still NOT built — slots in when its backing lands:
//   • Version history … needs a stored revision history (unbuilt)

export function overflowMenuItems({
  isPinned,
  driveAvailable = false,
  onShowInfo,
  onMove,
  onTogglePin,
  onDelete,
}) {
  return [
    { label: 'Show info', icon: 'file-text', onClick: onShowInfo },
    // Only offer Move when there's a Drive to move into.
    ...(driveAvailable ? [{ label: 'Move', icon: 'folder', onClick: onMove }] : []),
    // "Pin" matches Home's tile menu, which has always named this pair Pin/Unpin.
    // The icon must be a complete lucide class: feather has no "pin", so the old
    // bare name fell through FeatherIcon's fallback and drew a circle (#233).
    { label: isPinned ? 'Unpin' : 'Pin', icon: 'lucide-pin', onClick: onTogglePin },
    { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: onDelete },
  ]
}
