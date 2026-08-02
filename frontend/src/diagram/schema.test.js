import { describe, it, expect } from 'vitest'
import { createDiagramDocument, parseDiagramDocument } from './schema.js'

describe('schema diagramType', () => {
  it('defaults a fresh document to the block type with no mindmap', () => {
    const doc = createDiagramDocument()
    expect(doc.diagramType).toBe('block')
    expect(doc.mindmap).toBeNull()
  })

  it('seeds a blank mind-map document (user adds the first idea)', () => {
    const doc = createDiagramDocument(undefined, 'mindmap')
    expect(doc.diagramType).toBe('mindmap')
    expect(doc.mindmap.nodes).toEqual([])
  })

  it('seeds a blank flowchart document (user adds the first node)', () => {
    const doc = createDiagramDocument(undefined, 'flowchart')
    expect(doc.diagramType).toBe('flowchart')
    expect(doc.flowchart.direction).toBe('TB')
    expect(doc.flowchart.nodes).toEqual([])
    expect(doc.flowchart.edges).toEqual([])
    expect(doc.whiteboard).toBeNull()
  })

  it('seeds a whiteboard document with empty strokes and stickies', () => {
    const doc = createDiagramDocument(undefined, 'whiteboard')
    expect(doc.diagramType).toBe('whiteboard')
    expect(doc.whiteboard.sketchStyle).toBe(false)
    expect(doc.whiteboard.strokes).toEqual([])
    expect(doc.whiteboard.stickyNotes).toEqual([])
    expect(doc.flowchart).toBeNull()
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
    expect(parsed.flowchart).toBeNull()
    expect(parsed.whiteboard).toBeNull()
  })

  it('parses a JSON string document', () => {
    const parsed = parseDiagramDocument(JSON.stringify(createDiagramDocument(undefined, 'mindmap')))
    expect(parsed.diagramType).toBe('mindmap')
    expect(parsed.mindmap.nodes).toEqual([])
  })
})

// Free-floating (#122): on load, a unified doc's framed mind-map/flowchart flatten
// into the shared shapes[]/connectors[]. Legacy single-type docs are left alone.
describe('schema v2 free-floating migration', () => {
  function v1UnifiedWithContent() {
    return {
      schemaVersion: 1,
      diagramType: 'unified',
      themePreset: 'ocean',
      canvas: { sizePreset: 'Widescreen 16:9', width: 1280, height: 720, background: null },
      shapes: [],
      connectors: [],
      sections: [],
      mindmap: {
        rootId: 'm1', layout: 'balanced', origin: { x: 0, y: 0 }, crosslinks: [],
        nodes: [
          { id: 'm1', parentId: null, text: 'Root', depth: 0, order: 0 },
          { id: 'm2', parentId: 'm1', text: 'Child', depth: 1, order: 0, side: 'right' },
        ],
      },
      flowchart: {
        direction: 'TB', origin: { x: 0, y: 0 },
        nodes: [{ id: 'f1', nodeType: 'process', text: 'Step', x: 10, y: 20, w: 160, h: 72, branches: [] }],
        edges: [],
      },
      whiteboard: null,
    }
  }

  it('flattens a unified doc mind-map + flowchart into tagged shapes on load', () => {
    const parsed = parseDiagramDocument(v1UnifiedWithContent())
    expect(parsed.schemaVersion).toBe(2)
    const roles = parsed.shapes.map((s) => s.role)
    expect(roles).toContain('mindmap-node')
    expect(roles).toContain('flowchart-node')
    // The parent→child branch became a connector bound to the shapes.
    expect(parsed.connectors.some((c) => c.role === 'mindmap-branch')).toBe(true)
    // The sub-models are emptied (their content now lives in the shared arrays).
    expect(parsed.mindmap.nodes).toEqual([])
    expect(parsed.flowchart.nodes).toEqual([])
  })

  it('leaves a legacy single-type mind-map document on its sub-model path', () => {
    const legacy = {
      schemaVersion: 1, diagramType: 'mindmap',
      canvas: { sizePreset: 'Widescreen 16:9', width: 1280, height: 720, background: null },
      shapes: [], connectors: [],
      mindmap: {
        rootId: 'm1', layout: 'balanced', origin: { x: 0, y: 0 }, crosslinks: [],
        nodes: [{ id: 'm1', parentId: null, text: 'Root', depth: 0, order: 0 }],
      },
      flowchart: null, whiteboard: null,
    }
    const parsed = parseDiagramDocument(legacy)
    expect(parsed.mindmap.nodes).toHaveLength(1) // untouched — would blank its canvas
    expect(parsed.shapes.some((s) => s.role === 'mindmap-node')).toBe(false)
  })

  it('is idempotent — re-parsing a flattened doc keeps the same tagged shapes', () => {
    const once = parseDiagramDocument(v1UnifiedWithContent())
    const roleShapes = once.shapes.filter((s) => s.role).length
    const twice = parseDiagramDocument(once)
    expect(twice.shapes.filter((s) => s.role).length).toBe(roleShapes)
  })
})
