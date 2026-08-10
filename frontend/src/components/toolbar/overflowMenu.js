// Menu model for the editor "…" overflow (#111). A plain builder — not inline in
// the SFC — so the item set (labels, icons, the red Delete) can be unit-tested
// without mounting the toolbar. Shape matches frappe-ui Dropdown's `options`:
// { label, icon, onClick, theme? }.
//
// "Move …" moves the diagram into a Frappe Drive folder (#105); it appears only when
// Drive is available (`driveAvailable`), since there are no folders to move into
// otherwise. Backed by draw/api/drive_integration.py + MoveToDriveDialog.vue.
//
// Two things are deliberately absent.
//
// Rename (#232). The title in the top bar is the one way to rename a diagram —
// click it and it becomes an input. A menu row that only jumped focus there was a
// second door onto the same edit.
//
// Pin (#370). Pinning organises the library, so Home is where it belongs: it does
// nothing to what the editor is showing, and its result is invisible from here.
// It was also the one pin path that ignored the cap — Home blocks a sixth pin and
// says why, while this menu wrote the flag unchecked.
//
// Still NOT built — slots in when its backing lands:
//   • Version history … needs a stored revision history (unbuilt)

export function overflowMenuItems({ driveAvailable = false, onShowInfo, onMove, onDelete }) {
  return [
    { label: 'Show info', icon: 'file-text', onClick: onShowInfo },
    // Only offer Move when there's a Drive to move into.
    ...(driveAvailable ? [{ label: 'Move', icon: 'folder', onClick: onMove }] : []),
    { label: 'Delete', icon: 'trash-2', theme: 'red', onClick: onDelete },
  ]
}
