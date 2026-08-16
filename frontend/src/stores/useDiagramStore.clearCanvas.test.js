import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { parseDiagramDocument } from '@/diagram/schema.js'

// #462: "Clear All" wipes the canvas back to blank, whatever it holds. The eraser
// renders on the unified canvas too, so "everything" is the whole document — not
// only the ink the eraser itself can rub out.

function unifiedDocument() {
  return parseDiagramDocument(
    JSON.stringify({
      schemaVersion: 2,
      diagramType: 'unified',
      themePreset: 'ocean',
      canvas: { width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [{ id: 'c1', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } }],
      shapes: [
        { id: 's1', type: 'rectangle', x: 0, y: 0, w: 100, h: 50, text: { content: '', style: {} } },
        { id: 's2', type: 'rounded', x: 200, y: 0, w: 100, h: 50, role: 'mindmap-node', mindmap: { parentId: null, isRoot: true }, text: { content: '', style: {} } },
      ],
      whiteboard: {
        sketchStyle: true,
        strokes: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], color: '#171717', width: 3, kind: 'pen' }],
        stickyNotes: [{ id: 'w2', x: 0, y: 0, w: 100, h: 100, color: '#FEF3C7', text: 'note' }],
        lines: [{ id: 'wl1', x1: 0, y1: 0, x2: 10, y2: 10, color: '#171717', width: 2 }],
        tables: [{ id: 'wt1', x: 0, y: 0, rows: 2, cols: 2, cellW: 60, cellH: 30, color: '#171717' }],
      },
      mindmap: null,
      flowchart: null,
    }),
  )
}

function loaded(document) {
  const store = createDiagramStore()
  store.loadDocument(document)
  return store
}

describe('clearCanvas (#462)', () => {
  it('removes every kind of thing the canvas can hold', () => {
    const store = loaded(unifiedDocument())
    store.clearCanvas()

    expect(store.state.shapes).toEqual([])
    expect(store.state.connectors).toEqual([])
    expect(store.state.whiteboard.strokes).toEqual([])
    expect(store.state.whiteboard.stickyNotes).toEqual([])
    expect(store.state.whiteboard.lines).toEqual([])
    expect(store.state.whiteboard.tables).toEqual([])
  })

  // A mind-map node on a unified document is a role-tagged SHAPE, so clearing the
  // shapes is what clears the map. Worth pinning: it is the one kind of content the
  // eraser could never reach on its own.
  it('takes the mind-map nodes with the shapes', () => {
    const store = loaded(unifiedDocument())
    store.clearCanvas()
    expect(store.state.shapes.filter((s) => s.role === 'mindmap-node')).toEqual([])
  })

  // The point of doing this in the store rather than calling four removers from the
  // menu: one commit, so one undo brings the whole canvas back.
  it('undoes in a single step', () => {
    const store = loaded(unifiedDocument())
    store.clearCanvas()
    store.undo()

    expect(store.state.shapes).toHaveLength(2)
    expect(store.state.connectors).toHaveLength(1)
    expect(store.state.whiteboard.strokes).toHaveLength(1)
    expect(store.state.whiteboard.stickyNotes).toHaveLength(1)
  })

  it('drops the selection with the shapes it pointed at', () => {
    const store = loaded(unifiedDocument())
    store.select('s1')
    store.clearCanvas()
    expect(store.state.selection).toEqual([])
  })

  // The whiteboard's own settings are not content. Wiping the board should not also
  // reset how the next stroke will be drawn.
  it('keeps the board’s sketch setting', () => {
    const store = loaded(unifiedDocument())
    store.clearCanvas()
    expect(store.state.whiteboard.sketchStyle).toBe(true)
  })

  // A legacy single-type document keeps its TYPE. Setting the sub-model to null
  // would leave its own layer and toolbar with no model to read.
  it('empties a legacy mind map rather than removing its model', () => {
    const store = loaded(
      parseDiagramDocument(
        JSON.stringify({
          schemaVersion: 2,
          diagramType: 'mindmap',
          themePreset: 'ocean',
          canvas: { width: 1280, height: 720, background: 'none' },
          sections: [], connectors: [], shapes: [], whiteboard: null, flowchart: null,
          mindmap: {
            rootId: 'm1',
            layout: 'balanced',
            origin: { x: 0, y: 0 },
            crosslinks: [{ id: 'x1', from: 'm1', to: 'm2' }],
            nodes: [{ id: 'm1', parentId: null, text: 'Root', depth: 0, order: 0, side: null }],
          },
        }),
      ),
    )
    store.clearCanvas()

    expect(store.state.mindmap).not.toBeNull()
    expect(store.state.mindmap.nodes).toEqual([])
    expect(store.state.mindmap.rootId).toBeNull()
    expect(store.state.mindmap.crosslinks).toEqual([])
    expect(store.state.mindmap.layout, 'the map kept its layout setting').toBe('balanced')
  })
})
