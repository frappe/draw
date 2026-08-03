// Data access for Draw Diagram documents, via frappe-ui resources.
// Keeps all Draw Diagram API wiring in one place so views stay declarative.

import { createListResource, createDocumentResource } from 'frappe-ui'
import { createDiagramDocument } from '@/diagram/schema.js'
import { useAppSettings } from '@/composables/useAppSettings.js'
import { DEFAULT_THEME_PRESET } from '@/diagram/theme.js'

export const diagrams = createListResource({
  doctype: 'Draw Diagram',
  fields: ['name', 'title', 'canvas_size', 'modified'],
  filters: { is_trashed: 0 },
  orderBy: 'modified desc',
})

// Default title base per type. New diagrams are named "<base> <n>" (auto-
// incrementing) rather than "Untitled …", so no two new files share a name.
const TYPE_TITLE_BASE = {
  block: 'Diagram',
  mindmap: 'Mind map',
  flowchart: 'Flowchart',
  whiteboard: 'Whiteboard',
  unified: 'Drawing',
}

// Next unused default title for a type — "Flowchart 1", "Flowchart 2", … —
// unique among the currently-loaded diagrams (falls back to "Diagram n").
export function nextDiagramTitle(diagramType = 'block') {
  const base = TYPE_TITLE_BASE[diagramType] || 'Diagram'
  const taken = new Set((diagrams.data || []).map((d) => d.title))
  let n = 1
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

// Create a new diagram, returning its name. A template's pre-filled document may
// be supplied (NewDiagramDialog); otherwise a fresh document for `diagramType` is
// built (e.g. a mind map seeded with a root node). diagramType is carried inside
// the document JSON; the backend mirrors it to the diagram_type field on save.
export async function createDiagram(title, document = null, diagramType = 'block', folder = null) {
  if (!title) title = nextDiagramTitle(diagramType)
  // Only a FRESH document gets the user's saved theme/background defaults. A caller-
  // supplied template already carries its own look, so leave it untouched (#165 review).
  const isFresh = !document
  const finalDocument = document || createDiagramDocument(undefined, diagramType)
  if (!finalDocument.diagramType) finalDocument.diagramType = diagramType
  if (isFresh) applyDefaultSettings(finalDocument)
  const created = await diagrams.insert.submit({
    title,
    document: finalDocument,
    diagram_type: finalDocument.diagramType,
    // Create INSIDE the folder the user is currently viewing (spec P1); null = root.
    folder: folder || null,
  })
  return created.name
}

// Stamp a freshly-built diagram with the user's saved defaults (useAppSettings): the
// theme preset that colours its shapes and the canvas background. Both fall back to
// the engine defaults, so an untouched install behaves exactly as before. The caller
// runs this only for a document it built itself — templates and saved diagrams keep
// their own look.
function applyDefaultSettings(document) {
  const { settings } = useAppSettings()
  document.themePreset = settings.defaultThemePreset || DEFAULT_THEME_PRESET
  if (document.canvas) document.canvas.background = settings.defaultCanvasBackground ?? null
}

export function loadDiagram(name) {
  return createDocumentResource({
    doctype: 'Draw Diagram',
    name,
    auto: true,
  })
}
