// Diagram JSON schema — the single source of truth for a diagram document.
// Spec §11.3. Every diagram's `document` field holds an object of this shape.
// Bump SCHEMA_VERSION and add a migration whenever the shape changes; templates,
// theme presets, hover-arrows, and future diagram types all build on this.

import { DEFAULT_PRESET_NAME, findPreset } from './canvasPresets.js'

export const SCHEMA_VERSION = 1

// Canvas background "no color" renders white in the editor but exports
// transparent (spec §4.1). Null is the sentinel for "no color".
const NO_COLOR = null

export function createDiagramDocument(presetName = DEFAULT_PRESET_NAME) {
  const preset = findPreset(presetName)
  return {
    schemaVersion: SCHEMA_VERSION,
    canvas: {
      sizePreset: preset.name,
      width: preset.width,
      height: preset.height,
      background: NO_COLOR,
    },
    shapes: [],
    connectors: [],
  }
}

// Parse a document that may arrive as a JSON string (from the API) or an object,
// running it through migrations so callers always get the current schema.
export function parseDiagramDocument(raw) {
  const document = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!document || !document.canvas) return createDiagramDocument()
  return migrateDocument(document)
}

function migrateDocument(document) {
  // Only one version exists today; this is where future upgrades will live.
  return document
}
