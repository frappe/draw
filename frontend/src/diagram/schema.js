// Diagram JSON schema — the single source of truth for a diagram document.
// Spec §11.3. Every diagram's `document` field holds an object of this shape.
// Bump SCHEMA_VERSION and add a migration whenever the shape changes; templates,
// theme presets, hover-arrows, and future diagram types all build on this.

import { DEFAULT_PRESET_NAME, findPreset } from './canvasPresets.js'
import { createMindMap } from './mindmapModel.js'

export const SCHEMA_VERSION = 1

// The diagram type selects the active mode module (spec diagram-types §0).
// `block` is the original editor; the others are layered on the same engine.
export const DEFAULT_DIAGRAM_TYPE = 'block'
export const DIAGRAM_TYPES = ['block', 'mindmap', 'flowchart', 'whiteboard']

// Canvas background "no color" renders white in the editor but exports
// transparent (spec §4.1). Null is the sentinel for "no color".
const NO_COLOR = null

export function createDiagramDocument(presetName = DEFAULT_PRESET_NAME, diagramType = DEFAULT_DIAGRAM_TYPE) {
  const preset = findPreset(presetName)
  return {
    schemaVersion: SCHEMA_VERSION,
    diagramType,
    canvas: {
      sizePreset: preset.name,
      width: preset.width,
      height: preset.height,
      background: NO_COLOR,
    },
    shapes: [],
    connectors: [],
    // Per-type sub-objects; only the active type's is populated.
    mindmap: diagramType === 'mindmap' ? createMindMap() : null,
  }
}

// Parse a document that may arrive as a JSON string (from the API) or an object,
// running it through migrations so callers always get the current schema.
export function parseDiagramDocument(raw) {
  const document = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!document || !document.canvas) return createDiagramDocument()
  return migrateDocument(document)
}

// Existing v1 documents have no diagramType — default them to `block`
// (Part G3 backward-compat: read-time fallback).
function migrateDocument(document) {
  if (!document.diagramType) document.diagramType = DEFAULT_DIAGRAM_TYPE
  if (document.mindmap === undefined) document.mindmap = null
  return document
}
