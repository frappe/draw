// Optional Frappe Drive integration — availability probe + the Home "install
// Drive" banner rule. Draw is soft-coupled to Drive (see
// draw/api/drive_integration.py): the backend no-ops when Drive/Suite is absent.
// is_available() reports whether a usable Drive backend is present.

import { call } from 'frappe-ui'

// Ask the backend whether Drive is usable. Returns { installed, ready }, or null
// on any error so the UI treats the status as "unknown" and shows nothing rather
// than a misleading banner.
export async function getDriveAvailability() {
  try {
    return await call('draw.api.drive_integration.is_available')
  } catch {
    return null
  }
}

// The "Install Drive to track your files" banner is gone from Home (#449 item 2),
// and its predicate went with it. `getDriveAvailability` above is still live: the
// editor's overflow menu asks before offering "Move to Drive".

// List the sub-folders of a Drive folder (pass null for the owner's Home) plus the
// Home-down-to-here breadcrumb, for the "Move to folder" dialog (#105). Returns
// { drive_installed, current, path: [{ name, title }], folders: [{ name, title }] }.
export function listDriveFolders(parent = null) {
  return call('draw.api.drive_integration.list_drive_folders', { parent })
}

// Move a diagram's Drive file into `folder` (a Drive folder id, or null for Home).
// Returns { drive_installed, moved, file }. move()'s own permission / not-a-folder
// errors reject the call so the dialog can surface them.
export function moveToDriveFolder(name, folder) {
  return call('draw.api.drive_integration.move_to_drive_folder', { name, folder })
}

// The FOLDER ancestry (Home → … → the folder the diagram sits in) of a diagram's Drive
// file, for the editor toolbar's Drive-path breadcrumb (#112). Returns
// { drive_installed, registered, path: [{ name, title }] }, or null on any error so the
// toolbar falls back to the static "Frappe Draw" crumb rather than breaking.
export async function getDiagramDrivePath(name) {
  try {
    return await call('draw.api.drive_integration.diagram_drive_path', { name })
  } catch {
    return null
  }
}
