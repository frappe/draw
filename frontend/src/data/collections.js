// Collections — the personal groupings shown as chips above Home's list (#217).
// Thin wrappers over draw/api/collection.py, matching data/drive.js's shape.
//
// They are LABELS, not folders: a diagram belongs to as many as you like and is
// not moved anywhere, so a collection never competes with Drive's foldering.

import { call } from 'frappe-ui'

// [{ name, title, count }], newest ordering handled server-side. Returns an empty
// list on failure so Home renders without chips rather than breaking.
export async function listCollections() {
  try {
    return (await call('draw.api.collection.list_collections')) || []
  } catch {
    return []
  }
}

export function createCollection(title) {
  return call('draw.api.collection.create_collection', { title })
}

export function renameCollection(name, title) {
  return call('draw.api.collection.rename_collection', { name, title })
}

export function deleteCollection(name) {
  return call('draw.api.collection.delete_collection', { name })
}

// The diagram names in a collection, for Home to narrow its list to.
export async function diagramsInCollection(name) {
  try {
    return (await call('draw.api.collection.diagrams_in_collection', { name })) || []
  } catch {
    return []
  }
}

// Which of my collections a diagram is in, for the "Add to collection" dialog.
export async function collectionsOf(diagram) {
  try {
    return (await call('draw.api.collection.collections_of', { diagram })) || []
  } catch {
    return []
  }
}

export function addToCollection(name, diagram) {
  return call('draw.api.collection.add_to_collection', { name, diagram })
}

export function removeFromCollection(name, diagram) {
  return call('draw.api.collection.remove_from_collection', { name, diagram })
}
