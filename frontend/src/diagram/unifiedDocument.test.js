import { describe, it, expect } from 'vitest'
import {
  createDiagramDocument,
  createUnifiedDocument,
  parseDiagramDocument,
  isUnifiedDocument,
  UNIFIED_DIAGRAM_TYPE,
} from './schema.js'
import { createDiagramStore } from '@/stores/useDiagramStore.js'

// Canvas-unification Phase 1 (data model only): a unified document carries the
// shared block substrate AND all three sub-models, so any tool works on one
// canvas — while legacy single-type documents are untouched.

describe('unified document', () => {
  it('carries every sub-model (all non-null) plus the shared substrate', () => {
    const doc = createUnifiedDocument()
    expect(doc.diagramType).toBe(UNIFIED_DIAGRAM_TYPE)
    expect(isUnifiedDocument(doc)).toBe(true)
    expect(doc.mindmap).not.toBeNull()
    expect(doc.flowchart).not.toBeNull()
    expect(doc.whiteboard).not.toBeNull()
    // Shared substrate present and blank.
    expect(doc.shapes).toEqual([])
    expect(doc.connectors).toEqual([])
    expect(doc.sections).toEqual([])
  })

  it('starts every sub-model blank', () => {
    const doc = createUnifiedDocument()
    expect(doc.mindmap.nodes).toEqual([])
    expect(doc.flowchart.nodes).toEqual([])
    expect(doc.whiteboard.strokes).toEqual([])
  })

  it('gives the auto-layout frames distinct origins so they do not stack', () => {
    const doc = createUnifiedDocument()
    expect(doc.mindmap.origin).toEqual({ x: 600, y: 200 })
    expect(doc.flowchart.origin).toEqual({ x: 600, y: 700 })
    expect(doc.mindmap.origin).not.toEqual(doc.flowchart.origin)
  })
})

describe('legacy single-type documents are unchanged', () => {
  it('populates only its own sub-model; the others stay null', () => {
    const mm = createDiagramDocument(undefined, 'mindmap')
    expect(isUnifiedDocument(mm)).toBe(false)
    expect(mm.mindmap).not.toBeNull()
    expect(mm.flowchart).toBeNull()
    expect(mm.whiteboard).toBeNull()

    const block = createDiagramDocument(undefined, 'block')
    expect(block.mindmap).toBeNull()
    expect(block.flowchart).toBeNull()
    expect(block.whiteboard).toBeNull()
  })
})

describe('migration', () => {
  it('backfills missing sub-models for a unified doc saved before they existed', () => {
    const stored = {
      schemaVersion: 1,
      diagramType: UNIFIED_DIAGRAM_TYPE,
      canvas: { width: 1080, height: 1080 },
      shapes: [],
      connectors: [],
      // sections + all three sub-models absent (older save)
    }
    const doc = parseDiagramDocument(stored)
    expect(doc.sections).toEqual([])
    expect(doc.mindmap).not.toBeNull()
    expect(doc.flowchart).not.toBeNull()
    expect(doc.whiteboard).not.toBeNull()
    // Frame origins backfilled for older unified docs.
    expect(doc.mindmap.origin).toEqual({ x: 0, y: 0 })
    expect(doc.flowchart.origin).toEqual({ x: 0, y: 0 })
  })

  it('does NOT add sub-models to a legacy single-type doc', () => {
    const stored = {
      schemaVersion: 1,
      diagramType: 'block',
      canvas: { width: 1080, height: 1080 },
      shapes: [],
      connectors: [],
    }
    const doc = parseDiagramDocument(stored)
    expect(doc.mindmap).toBeNull()
    expect(doc.flowchart).toBeNull()
    expect(doc.whiteboard).toBeNull()
  })
})

describe('store capability check (hasSubModel)', () => {
  it('reports every sub-model available on a unified document', () => {
    const store = createDiagramStore(createUnifiedDocument())
    expect(store.hasSubModel('mindmap')).toBe(true)
    expect(store.hasSubModel('flowchart')).toBe(true)
    expect(store.hasSubModel('whiteboard')).toBe(true)
  })

  it('reports only the active sub-model on a legacy single-type document', () => {
    const store = createDiagramStore(createDiagramDocument(undefined, 'flowchart'))
    expect(store.hasSubModel('flowchart')).toBe(true)
    expect(store.hasSubModel('mindmap')).toBe(false)
    expect(store.hasSubModel('whiteboard')).toBe(false)
  })
})
