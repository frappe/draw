// Template gallery (spec 10.1) + save-as-template (spec 10.3). Built-in starters
// come from diagram/templates.js; user templates are persisted in localStorage
// (no backend Template doctype yet) keyed by diagram type. allTemplates(type)
// merges both for the new-diagram gallery; a "Blank" entry is always first.

import { ref } from 'vue'
import { builtinTemplates } from '@/diagram/templates.js'

const KEY = 'frappe-draw-templates'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

// Reactive list of saved templates so the gallery updates after a save/delete.
export const savedTemplates = ref(load())

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(savedTemplates.value))
  } catch {
    /* storage full / unavailable — saving is best-effort */
  }
}

// Persist the current document as a reusable template for its type. Returns the
// new template's id. Ids are derived from a monotonic counter in the stored list
// (no Date/random needed) so they stay stable across reloads.
export function saveTemplate({ name, type, document }) {
  const id = `t${(savedTemplates.value.reduce((m, t) => Math.max(m, t.seq || 0), 0) + 1)}`
  savedTemplates.value = [
    ...savedTemplates.value,
    { id, seq: Number(id.slice(1)), name: name || 'My template', type, document, saved: true },
  ]
  persist()
  return id
}

export function deleteTemplate(id) {
  savedTemplates.value = savedTemplates.value.filter((t) => t.id !== id)
  persist()
}

// Gallery entries for a type: Blank, then built-ins, then the user's saved ones.
export function allTemplates(type) {
  const blank = { key: 'blank', name: 'Blank', hint: 'Empty canvas', build: () => null }
  const builtins = builtinTemplates(type)
  const saved = savedTemplates.value
    .filter((t) => t.type === type)
    .map((t) => ({ key: t.id, id: t.id, name: t.name, hint: 'Saved template', saved: true, build: () => clone(t.document) }))
  return [blank, ...builtins, ...saved]
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null
}
