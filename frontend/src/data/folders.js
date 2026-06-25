// Data access for Draw Folder documents, via frappe-ui resources. Keeps folder
// API wiring in one place so the home sidebar stays declarative (spec §2).
import { createListResource } from 'frappe-ui'

export const folders = createListResource({
  doctype: 'Draw Folder',
  fields: ['name', 'folder_name', 'parent_folder', 'sort_order'],
  orderBy: 'sort_order asc',
})

// Create a new folder (optionally nested under parentFolder), returning its
// name. Reloads the list so the sidebar/explorer reflect it immediately.
export async function createFolder(folderName, parentFolder = null) {
  const created = await folders.insert.submit({ folder_name: folderName, parent_folder: parentFolder || null })
  await folders.reload()
  return created.name
}

// Rename a folder (updates the display name; the doc name/Link stays stable).
export async function renameFolder(name, folderName) {
  await folders.setValue.submit({ name, folder_name: folderName })
  await folders.reload()
}

// Delete a folder. Diagrams keep their data; their folder link just clears.
export async function deleteFolder(name) {
  await folders.delete.submit(name)
  await folders.reload()
}

// Move a diagram into (or out of, with null) a folder. Used by drag-to-file.
export function moveDiagramToFolder(diagrams, diagramName, folderName) {
  return diagrams.setValue.submit({ name: diagramName, folder: folderName || null })
}
