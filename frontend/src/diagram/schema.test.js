import { describe, it, expect } from 'vitest'
import { createDiagramDocument, parseDiagramDocument } from './schema.js'

describe('schema diagramType', () => {
  it('defaults a fresh document to the block type with no mindmap', () => {
    const doc = createDiagramDocument()
    expect(doc.diagramType).toBe('block')
    expect(doc.mindmap).toBeNull()
  })

  it('seeds a mind-map document with a root node', () => {
    const doc = createDiagramDocument(undefined, 'mindmap')
    expect(doc.diagramType).toBe('mindmap')
    expect(doc.mindmap.rootId).toBeTruthy()
    expect(doc.mindmap.nodes).toHaveLength(1)
  })

  it('backward-compat: a v1 document without diagramType parses as block', () => {
    const v1 = {
      schemaVersion: 1,
      canvas: { sizePreset: 'Widescreen 16:9', width: 1280, height: 720, background: null },
      shapes: [],
      connectors: [],
    }
    const parsed = parseDiagramDocument(v1)
    expect(parsed.diagramType).toBe('block')
    expect(parsed.mindmap).toBeNull()
  })

  it('parses a JSON string document', () => {
    const parsed = parseDiagramDocument(JSON.stringify(createDiagramDocument(undefined, 'mindmap')))
    expect(parsed.diagramType).toBe('mindmap')
    expect(parsed.mindmap.nodes).toHaveLength(1)
  })
})
