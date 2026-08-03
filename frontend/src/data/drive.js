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

// Show the "Install Drive to track your files" banner ONLY once we've confirmed
// Drive is not available. While the status is still loading (null) or unknown, stay
// hidden so the banner never flashes for users who do have Drive. (Product note:
// shown until Suite is integrated; removed then.)
export function shouldShowInstallDriveBanner(status) {
  return status != null && status.installed === false
}

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
