// Data access for Draw Diagram documents, via frappe-ui resources.
// Keeps all Draw Diagram API wiring in one place so views stay declarative.

import { createListResource, createDocumentResource } from 'frappe-ui'
import { createDiagramDocument } from '@/diagram/schema.js'

export const diagrams = createListResource({
  doctype: 'Draw Diagram',
  fields: ['name', 'title', 'canvas_size', 'modified'],
  filters: { is_trashed: 0 },
  orderBy: 'modified desc',
})

// Create a new diagram, returning its name. A template's pre-filled document may
// be supplied (NewDiagramDialog); otherwise a fresh document for `diagramType` is
// built (e.g. a mind map seeded with a root node). diagramType is carried inside
// the document JSON; the backend mirrors it to the diagram_type field on save.
export async function createDiagram(title = 'Untitled diagram', document = null, diagramType = 'block') {
  const finalDocument = document || createDiagramDocument(undefined, diagramType)
  if (!finalDocument.diagramType) finalDocument.diagramType = diagramType
  const created = await diagrams.insert.submit({
    title,
    document: finalDocument,
    diagram_type: finalDocument.diagramType,
  })
  return created.name
}

export function loadDiagram(name) {
  return createDocumentResource({
    doctype: 'Draw Diagram',
    name,
    auto: true,
  })
}
