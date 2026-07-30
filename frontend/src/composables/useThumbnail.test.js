import { describe, it, expect, vi } from 'vitest'

// frappe-ui's source only resolves through its vite plugin; documentToSvg itself is
// pure, so stub the module boundary.
vi.mock('frappe-ui', () => ({ createResource: () => ({ submit: () => {} }) }))

const { documentToSvg, isDocumentEmpty, safeColor } = await import('./useThumbnail.js')

// documentToSvg is the SINGLE render-to-SVG path: PNG/PDF export (useExport), the
// saved thumbnail, and the home + trash tile previews all go through it. So anything
// it omits is missing from every one of those at once.

function unifiedDocument() {
  return {
    schemaVersion: 1,
    diagramType: 'unified',
    themePreset: 'ocean',
    canvas: { sizePreset: 'Widescreen 16:9', width: 1280, height: 720, background: 'none' },
    sections: [],
    connectors: [],
    shapes: [
      {
        id: 's1', type: 'rectangle', x: 100, y: 100, w: 200, h: 120, rotation: 0, opacity: 1,
        zIndex: 0, fill: '#EFF6FF', border: { color: '#4F94FF', width: 2 },
        text: { content: 'BLOCK-SHAPE', style: {} },
      },
    ],
    whiteboard: {
      strokes: [
        {
          id: 'w1',
          points: [{ x: 400, y: 300 }, { x: 500, y: 340 }, { x: 600, y: 300 }],
          color: '#123456',
          width: 3,
          kind: 'pen',
        },
      ],
      stickyNotes: [{ id: 'w2', x: 700, y: 200, w: 180, h: 180, color: '#FEF3C7', text: 'STICKY-TEXT' }],
      lines: [{ id: 'wl1', x1: 300, y1: 500, x2: 620, y2: 500, color: '#AA0011', width: 3, start: 'none', end: 'arrow' }],
      tables: [{ id: 'wt1', x: 300, y: 560, rows: 2, cols: 2, cellW: 120, cellH: 40, color: '#00AA55', cells: { '0,0': 'TABLE-CELL' } }],
      votes: {},
      sketchStyle: false,
    },
    mindmap: {
      rootId: 'm1',
      layout: 'balanced',
      origin: { x: 0, y: 900 },
      crosslinks: [],
      nodes: [
        { id: 'm1', parentId: null, text: 'MINDMAP-ROOT', depth: 0, order: 0, side: null },
        { id: 'm2', parentId: 'm1', text: 'MINDMAP-CHILD', depth: 1, order: 0, side: 'right' },
      ],
    },
    flowchart: {
      direction: 'TB',
      origin: { x: 1500, y: 0 },
      nodes: [
        { id: 'f1', nodeType: 'terminator', text: 'FLOW-START', x: 0, y: 0, w: 150, h: 60, branches: [] },
        { id: 'f2', nodeType: 'process', text: 'FLOW-STEP', x: 0, y: 150, w: 160, h: 72, branches: [] },
      ],
      edges: [
        {
          id: 'fe1', from: { nodeId: 'f1', port: 'out' }, to: { nodeId: 'f2', port: 'in' },
          label: '', arrowheads: { start: false, end: true }, routing: 'orthogonal', kind: 'flow',
        },
      ],
    },
  }
}

describe('documentToSvg for a unified document', () => {
  // Every NEW diagram is a unified document, so an omission here affects the common
  // case, not an edge case.
  it('includes the block shapes', () => {
    expect(documentToSvg(unifiedDocument())).toContain('BLOCK-SHAPE')
  })

  it('includes whiteboard ink and sticky notes', () => {
    const svg = documentToSvg(unifiedDocument())
    expect(svg, 'whiteboard stroke colour missing from the export').toContain('#123456')
    expect(svg, 'sticky note missing from the export').toContain('STICKY-TEXT')
  })

  it('includes whiteboard lines and tables', () => {
    // These were omitted from the export entirely — for legacy whiteboards too, not
    // just unified documents.
    const svg = documentToSvg(unifiedDocument())
    expect(svg, 'whiteboard line missing from the export').toContain('#AA0011')
    expect(svg, 'whiteboard table missing from the export').toContain('#00AA55')
    expect(svg, 'table cell text missing from the export').toContain('TABLE-CELL')
  })

  it('includes the mind-map frame', () => {
    const svg = documentToSvg(unifiedDocument())
    expect(svg).toContain('MINDMAP-ROOT')
    expect(svg).toContain('MINDMAP-CHILD')
  })

  it('includes the flowchart frame', () => {
    const svg = documentToSvg(unifiedDocument())
    expect(svg).toContain('FLOW-START')
    expect(svg).toContain('FLOW-STEP')
  })

  it('frames the whole composition, not just the canvas rect', () => {
    const svg = documentToSvg(unifiedDocument())
    const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)
    const [x, y, w, h] = viewBox
    // The flowchart frame sits at x=1500 and the mind map at y=900, both outside the
    // 1280x720 canvas rect, so a canvas-sized viewBox would crop them away.
    expect(x + w, 'viewBox is too narrow to include the flowchart frame').toBeGreaterThan(1500)
    expect(y + h, 'viewBox is too short to include the mind-map frame').toBeGreaterThan(900)
  })
})

describe('documentToSvg still renders single-type documents', () => {
  it('renders a legacy whiteboard document, including lines and tables', () => {
    const doc = { ...unifiedDocument(), diagramType: 'whiteboard', mindmap: null, flowchart: null }
    const svg = documentToSvg(doc)
    expect(svg).toContain('#123456')
    expect(svg).toContain('STICKY-TEXT')
    expect(svg).toContain('#AA0011')
    expect(svg).toContain('TABLE-CELL')
  })

  it('renders a legacy mindmap document', () => {
    const doc = { ...unifiedDocument(), diagramType: 'mindmap' }
    expect(documentToSvg(doc)).toContain('MINDMAP-ROOT')
  })

  it('renders a legacy flowchart document', () => {
    const doc = { ...unifiedDocument(), diagramType: 'flowchart' }
    expect(documentToSvg(doc)).toContain('FLOW-START')
  })

  it('renders a legacy block document', () => {
    const doc = { ...unifiedDocument(), diagramType: 'block' }
    expect(documentToSvg(doc)).toContain('BLOCK-SHAPE')
  })
})

describe('safeColor', () => {
  // Colours reach SVG attributes straight from the persisted document, and diagrams are
  // SHARED — so a colour crafted by one user is rendered in another user's browser.
  it('passes real colour syntax through', () => {
    for (const ok of ['#abc', '#AABBCC', '#aabbccdd', 'rgb(1,2,3)', 'rgba(1,2,3,0.5)', 'red']) {
      expect(safeColor(ok), ok).toBe(ok)
    }
  })

  it('rejects anything that could break out of the attribute', () => {
    expect(safeColor('" onload="alert(1)')).toBe('none')
    expect(safeColor('#fff" /><script>alert(1)</script>')).toBe('none')
    expect(safeColor(undefined)).toBe('none')
    expect(safeColor('', '#171717')).toBe('#171717')
  })

  it('keeps an injected frame origin out of the rendered markup', () => {
    const doc = unifiedDocument()
    doc.flowchart.origin = { x: '0" /><script>alert(1)</script>', y: 0 }
    const svg = documentToSvg(doc)
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('alert(1)')
  })

  it('gives an edge-labelled flowchart more margin so the label is not cropped', () => {
    const plain = unifiedDocument()
    const labelled = unifiedDocument()
    labelled.flowchart.edges[0].label = 'a long branch label'
    const boxOf = (d) => documentToSvg(d).match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)
    expect(boxOf(labelled)[2]).toBeGreaterThan(boxOf(plain)[2])
  })

  it('keeps an injected colour out of the rendered markup', () => {
    const doc = unifiedDocument()
    doc.whiteboard.lines[0].color = '" onload="alert(1)'
    expect(documentToSvg(doc)).not.toContain('onload')
  })
})

describe('isDocumentEmpty', () => {
  it('does not call a unified document with only ink empty', () => {
    const doc = unifiedDocument()
    doc.shapes = []
    doc.mindmap.nodes = []
    doc.flowchart.nodes = []
    doc.flowchart.edges = []
    // Only whiteboard content remains — previously this reported empty, because
    // isDocumentEmpty had no unified branch at all.
    expect(isDocumentEmpty(doc)).toBe(false)
  })

  it('does not call a whiteboard holding only a table empty', () => {
    const doc = { ...unifiedDocument(), diagramType: 'whiteboard', mindmap: null, flowchart: null }
    doc.shapes = []
    doc.whiteboard.strokes = []
    doc.whiteboard.stickyNotes = []
    doc.whiteboard.lines = []
    expect(isDocumentEmpty(doc)).toBe(false)
  })

  it('still reports a genuinely blank unified document as empty', () => {
    const doc = unifiedDocument()
    doc.shapes = []
    doc.connectors = []
    doc.sections = []
    doc.whiteboard = { strokes: [], stickyNotes: [], lines: [], tables: [], votes: {}, sketchStyle: false }
    doc.mindmap.nodes = []
    doc.flowchart.nodes = []
    doc.flowchart.edges = []
    expect(isDocumentEmpty(doc)).toBe(true)
  })
})
