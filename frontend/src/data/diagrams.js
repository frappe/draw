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
// be supplied (NewDiagramDialog); otherwise it starts empty.
export async function createDiagram(title = 'Untitled diagram', document = createDiagramDocument()) {
  const created = await diagrams.insert.submit({
    title,
    document,
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
