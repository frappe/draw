import { describe, it, expect, vi, afterEach } from 'vitest'

// frappe-ui's source only resolves through its vite plugin; documentToSvg itself is
// pure, so stub the module boundary.
vi.mock('frappe-ui', () => ({ createResource: () => ({ submit: () => {} }) }))

const { documentToSvg, inlinedImages, isDocumentEmpty, safeColor } = await import('./useThumbnail.js')
const { ROUNDED_CORNER_RADIUS, SHARP_CORNER_RADIUS } = await import('@/diagram/shapeGeometry.js')
const { HIGHLIGHTER_OPACITY } = await import('@/diagram/whiteboardColors.js')
const { presetPolygonPoints } = await import('@/diagram/polygon.js')

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

  it('renders fill and border for a text box (#579)', () => {
    const doc = {
      ...unifiedDocument(),
      shapes: [
        {
          id: 't1',
          type: 'text',
          text: { content: 'Hello', style: {} },
          x: 10,
          y: 20,
          w: 100,
          h: 50,
          fill: '#FF0000',
          border: { color: '#0000FF', width: 2 },
        },
      ],
    }
    const svg = documentToSvg(doc)
    expect(svg).toContain('fill="#FF0000"')
    expect(svg).toContain('stroke="#0000FF"')
    expect(svg).toContain('stroke-width="2"')
  })

  it('includes whiteboard ink and sticky notes', () => {
    const svg = documentToSvg(unifiedDocument())
    expect(svg, 'whiteboard stroke colour missing from the export').toContain('#123456')
    expect(svg, 'sticky note missing from the export').toContain('STICKY-TEXT')
  })

  it('paints a stroke at the opacity it was drawn with', () => {
    // #409: the export recomputed opacity from `kind` alone, so a pen set to 30%
    // came out solid and a highlighter always came out at exactly the default —
    // the board on screen and every rendering of it disagreed.
    const doc = unifiedDocument()
    doc.whiteboard.strokes[0].opacity = 0.3
    expect(documentToSvg(doc)).toContain('stroke-opacity="0.3"')
  })

  it('falls back to the ink default for a stroke saved before opacity was stored', () => {
    const doc = unifiedDocument()
    doc.whiteboard.strokes[0].kind = 'highlighter'
    delete doc.whiteboard.strokes[0].opacity
    expect(documentToSvg(doc)).toContain(`stroke-opacity="${HIGHLIGHTER_OPACITY}"`)
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

// Whimsical mind map (#125): a text node (mindmap.shaped false) must export with
// NO box — shapeBody returns '' — while its centred label (shapeText) still draws,
// matching the on-canvas look. A shaped node keeps its rect. documentToSvg is the
// render path that exercises both.
describe('documentToSvg — Whimsical mind-map nodes (#125)', () => {
  function mindmapNodesDoc() {
    return {
      schemaVersion: 2,
      diagramType: 'unified',
      themePreset: 'ocean',
      canvas: { sizePreset: 'Widescreen 16:9', width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [],
      shapes: [
        {
          id: 'm1', type: 'rounded', x: 100, y: 100, w: 160, h: 48, rotation: 0, opacity: 1, zIndex: 1,
          fill: '#ECE7FE', border: { color: '#6E56CF', width: 2 }, text: { content: 'ROOT-BOX', style: {} },
          role: 'mindmap-node',
          mindmap: { parentId: null, isRoot: true, shaped: true },
        },
        {
          id: 'm2', type: 'rounded', x: 320, y: 100, w: 140, h: 40, rotation: 0, opacity: 1, zIndex: 2,
          fill: '#C0FFEE', border: { color: '#6E56CF', width: 1.5 }, text: { content: 'CHILD-TEXT', style: {} },
          role: 'mindmap-node',
          mindmap: { parentId: 'm1', isRoot: false, shaped: false },
        },
      ],
      mindmap: null, flowchart: null, whiteboard: null,
    }
  }

  it('draws a box for the shaped root but none for the text child', () => {
    const svg = documentToSvg(mindmapNodesDoc())
    // The shaped root renders as a rect carrying its fill…
    expect(svg).toMatch(/<rect[^>]*fill="#ECE7FE"/)
    // …the text child's box is suppressed, so its fill never reaches the markup.
    expect(svg, 'a text node exported with a box').not.toContain('#C0FFEE')
  })

  it('still exports the label of a text node', () => {
    const svg = documentToSvg(mindmapNodesDoc())
    expect(svg).toContain('ROOT-BOX')
    expect(svg, 'the text node label was dropped from the export').toContain('CHILD-TEXT')
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

// Corner radius (#411): the rect branch hardcoded rx="8", so a box left the canvas
// less rounded than it was drawn — in PNG export, PDF export, the home tile and the
// minimap at once. The radius has to come from the same helper ShapeView uses.
describe('documentToSvg — corner radius', () => {
  function boxDoc(shape) {
    return {
      schemaVersion: 2,
      diagramType: 'block',
      themePreset: 'ocean',
      canvas: { width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [],
      shapes: [
        {
          id: 'b1', x: 0, y: 0, w: 200, h: 100, rotation: 0, opacity: 1, zIndex: 1,
          fill: '#EFF6FF', border: { color: '#4F94FF', width: 2 }, text: { content: '', style: {} },
          ...shape,
        },
      ],
      mindmap: null, flowchart: null, whiteboard: null,
    }
  }

  const rxOf = (svg) => svg.match(/<rect[^>]*\srx="([^"]*)"/)[1]

  it("exports the shape's own radius, not a fixed one", () => {
    expect(rxOf(documentToSvg(boxDoc({ type: 'rounded', cornerRadius: 32 })))).toBe('32')
    expect(rxOf(documentToSvg(boxDoc({ type: 'rounded', cornerRadius: 4 })))).toBe('4')
  })

  it('exports a rounded rectangle at the radius the canvas draws it', () => {
    expect(rxOf(documentToSvg(boxDoc({ type: 'rounded' })))).toBe(String(ROUNDED_CORNER_RADIUS))
  })

  it('keeps a plain rectangle lightly rounded', () => {
    expect(rxOf(documentToSvg(boxDoc({ type: 'rectangle' })))).toBe(String(SHARP_CORNER_RADIUS))
  })

  it('falls back to the type default rather than letting a crafted radius through', () => {
    const svg = documentToSvg(boxDoc({ type: 'rounded', cornerRadius: '8" onload="alert(1)' }))
    expect(svg, 'an event handler reached the markup').not.toMatch(/\son[a-z]+\s*=/i)
    expect(rxOf(svg)).toBe(String(ROUNDED_CORNER_RADIUS))
  })
})

// Freely-drawn polygon (#139): a shape carrying its own vertices, normalised to the
// box, must export as a <polygon> whose points scale onto x/y/w/h — matching
// ShapeView on the live canvas. documentToSvg is the single export path.
describe('documentToSvg — freely-drawn polygon (#139)', () => {
  function polygonDoc(points) {
    return {
      schemaVersion: 2,
      diagramType: 'block',
      themePreset: 'ocean',
      canvas: { width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [],
      shapes: [
        {
          id: 'p1', type: 'polygon', x: 0, y: 0, w: 200, h: 100, rotation: 0, opacity: 1, zIndex: 1,
          fill: '#EFF6FF', border: { color: '#4F94FF', width: 2 },
          text: { content: '', style: {} },
          points: points || [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }],
        },
      ],
      mindmap: null, flowchart: null, whiteboard: null,
    }
  }

  it('exports a polygon with its normalised points scaled onto the box', () => {
    const svg = documentToSvg(polygonDoc())
    // (0,0)->0,0 (1,0)->200,0 (0.5,1)->100,100.
    expect(svg).toContain('<polygon points="0,0 200,0 100,100"')
    expect(svg).toContain('#EFF6FF') // the fill still reaches the markup
  })

  it('neutralises a crafted point component instead of letting it escape the attribute', () => {
    const svg = documentToSvg(polygonDoc([{ x: '0" onload="alert(1)', y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]))
    expect(svg, 'an event handler reached the markup').not.toMatch(/\son[a-z]+\s*=/i)
    expect(svg).not.toContain('alert(1)')
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

  // Free-floating (#122, v2): a unified doc's flowchart flattens into tagged
  // shapes on the render path, so a node draws as a translate-wrapped glyph in the
  // shared layer (not via the now-empty sub-model), and its label still renders.
  it('flattens a unified flowchart into tagged shape glyphs on render', () => {
    const svg = documentToSvg(unifiedDocument())
    // f1 (terminator) at flowchart origin (1500,0) + node (0,0) → translate(1500 0).
    expect(svg).toMatch(/<g transform="translate\(1500 0\)"><rect/)
    expect(svg).toContain('FLOW-START')
    expect(svg).toContain('MINDMAP-ROOT')
  })

  it('keeps an injected colour out of the rendered markup', () => {
    const doc = unifiedDocument()
    doc.whiteboard.lines[0].color = '" onload="alert(1)'
    expect(documentToSvg(doc)).not.toContain('onload')
  })

  // Free-floating (#122): a migrated flowchart node lives in shapes[] tagged with
  // its nodeType. Export/thumbnails must draw the real glyph, not a plain rect.
  it('renders a migrated flowchart node with its exact glyph', () => {
    const doc = {
      schemaVersion: 2,
      diagramType: 'unified',
      themePreset: 'ocean',
      canvas: { width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [],
      shapes: [
        {
          id: 'f1', type: 'rectangle', x: 200, y: 150, w: 160, h: 84,
          rotation: 0, opacity: 1, zIndex: 1, fill: 'none',
          border: { color: '#525252', width: 1.5 },
          text: { content: 'Doc', style: {} },
          role: 'flowchart-node',
          flowchart: { nodeType: 'document', branches: [], manuallyPositioned: false },
        },
      ],
      mindmap: null, flowchart: null, whiteboard: null,
    }
    const svg = documentToSvg(doc)
    // 'document' is a path glyph drawn in a translate group at the node origin —
    // a plain rect (the pre-#122 fallback) would have no translated <path>.
    expect(svg).toMatch(/translate\(200 150\)"><path d=/)
    expect(svg).toContain('Doc')
  })
})

// The markup this file builds is injected with v-html by the home and trash tiles
// (DiagramTile/TrashView), and that grid lists diagrams SHARED with the user and
// public ones — documents authored by someone else. parseDiagramDocument does no
// value coercion whatsoever, so every field below arrives exactly as it was posted.
//
// safeColor and num existed but were only applied to the whiteboard line/table
// renderers, so every other layer still interpolated raw. One case per field, so a
// regression names the field that reopened it rather than just "injection".
describe('no persisted value can escape its SVG attribute', () => {
  const PAYLOAD = '" onload="alert(1)'
  const CLOSING = '"/><script>alert(1)</script><rect x="0'

  // Each entry crafts one field of an otherwise ordinary unified document.
  const FIELDS = {
    'block shape fill': (d) => (d.shapes[0].fill = PAYLOAD),
    'block shape border colour': (d) => (d.shapes[0].border.color = PAYLOAD),
    'block shape border width': (d) => (d.shapes[0].border.width = PAYLOAD),
    'block shape opacity': (d) => (d.shapes[0].opacity = PAYLOAD),
    'block shape x': (d) => (d.shapes[0].x = CLOSING),
    'block shape w': (d) => (d.shapes[0].w = CLOSING),
    'block shape text colour': (d) => (d.shapes[0].text.style = { color: PAYLOAD }),
    'block shape text size': (d) => (d.shapes[0].text.style = { size: PAYLOAD }),
    'connector colour': (d) => (d.connectors = [{ id: 'c1', from: { x: 0, y: 0 }, to: { x: 9, y: 9 }, style: { color: PAYLOAD } }]),
    'connector free endpoint': (d) => (d.connectors = [{ id: 'c1', from: { x: CLOSING, y: 0 }, to: { x: 9, y: 9 }, style: {} }]),
    'section colour': (d) => (d.sections = [{ id: 'sec1', x: 0, y: 0, w: 10, h: 10, color: PAYLOAD, title: 'T' }]),
    'section geometry': (d) => (d.sections = [{ id: 'sec1', x: CLOSING, y: 0, w: 10, h: 10, title: 'T' }]),
    'canvas width (the viewBox)': (d) => (d.canvas.width = CLOSING),
    'mind-map node colour': (d) => (d.mindmap.nodes[1].color = PAYLOAD),
    'mind-map node font size': (d) => (d.mindmap.nodes[1].fontSize = PAYLOAD),
    'flowchart node fill': (d) => (d.flowchart.nodes[0].fill = PAYLOAD),
    'flowchart node border': (d) => (d.flowchart.nodes[0].border = PAYLOAD),
    'flowchart node x': (d) => (d.flowchart.nodes[0].x = CLOSING),
    'flowchart edge label anchor': (d) => {
      d.flowchart.edges[0].label = 'yes'
      d.flowchart.nodes[0].y = CLOSING
    },
    'whiteboard stroke colour': (d) => (d.whiteboard.strokes[0].color = PAYLOAD),
    'whiteboard stroke width': (d) => (d.whiteboard.strokes[0].width = PAYLOAD),
    'whiteboard stroke opacity': (d) => (d.whiteboard.strokes[0].opacity = PAYLOAD),
    'whiteboard stroke point': (d) => (d.whiteboard.strokes[0].points[0] = { x: CLOSING, y: 0 }),
    'sticky note colour': (d) => (d.whiteboard.stickyNotes[0].color = PAYLOAD),
    'sticky note geometry': (d) => (d.whiteboard.stickyNotes[0].x = CLOSING),
    'whiteboard line colour': (d) => (d.whiteboard.lines[0].color = PAYLOAD),
    'whiteboard table colour': (d) => (d.whiteboard.tables[0].color = PAYLOAD),
    'mind-map frame origin': (d) => (d.mindmap.origin = { x: CLOSING, y: 0 }),
    'flowchart frame origin': (d) => (d.flowchart.origin = { x: CLOSING, y: 0 }),
  }

  for (const [field, craft] of Object.entries(FIELDS)) {
    it(`neutralises a payload in the ${field}`, () => {
      const doc = unifiedDocument()
      craft(doc)
      const svg = documentToSvg(doc)
      expect(svg, 'an event handler reached the markup').not.toMatch(/\son[a-z]+\s*=/i)
      expect(svg, 'a tag was injected').not.toContain('<script')
      expect(svg, 'the payload survived verbatim').not.toContain('alert(1)')
    })
  }

  it('still renders every layer of an untampered document', () => {
    // The guards must not be silently swallowing legitimate values: the fallbacks are
    // all valid colours/numbers too, so a broken guard would pass the tests above.
    const svg = documentToSvg(unifiedDocument())
    expect(svg).toContain('#EFF6FF') // block fill
    expect(svg).toContain('#123456') // stroke colour
    expect(svg).toContain('#FEF3C7') // sticky colour
    expect(svg).toContain('MINDMAP-CHILD')
    expect(svg).toContain('FLOW-STEP')
  })
})

describe('table dimensions from an untrusted document (D5)', () => {
  it('clamps an absurd row/col count so the render cannot hang', () => {
    // rows/cols come from the untrusted document and drive a nested loop, so a
    // shared/public diagram with rows:1e9 would otherwise loop ~1e18 times and hang
    // every viewer's browser on the tile/thumbnail/export render. The render now
    // shares the model's clamp (tableRows/tableCols → MAX_TABLE_DIM, 50), so at most
    // 50*50 cell rects are emitted — the same bound the live canvas uses.
    const doc = { ...unifiedDocument(), diagramType: 'whiteboard', mindmap: null, flowchart: null }
    doc.whiteboard.tables = [
      { id: 'wt-huge', x: 0, y: 0, rows: 1e9, cols: 1e9, cellW: 40, cellH: 20, color: '#00AA55', cells: {} },
    ]

    const svg = documentToSvg(doc)
    // Cell borders are the neutral grid colour now, not the table's own (#553):
    // that colour is the table's TEXT colour.
    const cells = (svg.match(/stroke="#E6E6EA"/g) || []).length
    expect(cells, 'the table loop was not clamped').toBe(50 * 50)
  })

  it('still renders a normal small table in full', () => {
    // The clamp must not shrink a legitimate table: 2x2 = 4 cells.
    const doc = { ...unifiedDocument(), diagramType: 'whiteboard', mindmap: null, flowchart: null }
    doc.whiteboard.tables = [
      { id: 'wt', x: 0, y: 0, rows: 2, cols: 2, cellW: 40, cellH: 20, color: '#00AA55', cells: {} },
    ]
    expect((documentToSvg(doc).match(/stroke="#E6E6EA"/g) || []).length).toBe(4)
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
    doc.whiteboard = { strokes: [], stickyNotes: [], lines: [], tables: [], sketchStyle: false }
    doc.mindmap.nodes = []
    doc.flowchart.nodes = []
    doc.flowchart.edges = []
    expect(isDocumentEmpty(doc)).toBe(true)
  })
})

// Per-cell rich text (#344). documentToSvg is the export/thumbnail path, so a
// formatted cell must come out looking like it does on the canvas — the same
// parity kept for alignment and merges.
describe('documentToSvg — table cell formatting (#344)', () => {
  const withTable = (table) => {
    const doc = { ...unifiedDocument(), diagramType: 'whiteboard', mindmap: null, flowchart: null }
    doc.whiteboard.tables = [{ id: 'wt1', x: 0, y: 0, rows: 2, cols: 2, cellW: 120, cellH: 40, color: '#171717', ...table }]
    return documentToSvg(doc)
  }

  it('renders a legacy plain-string cell exactly as before', () => {
    const svg = withTable({ cells: { '0,0': 'PLAIN-CELL' } })
    expect(svg).toContain('PLAIN-CELL')
    expect(svg).toContain('font-weight="400"')
  })

  it('carries bold, italic and underline through to the export', () => {
    const svg = withTable({
      cells: { '0,0': 'Q1 total' },
      cellRuns: { '0,0': [{ text: 'Q1 ' }, { text: 'total', bold: true, italic: true, underline: true }] },
    })
    expect(svg).toContain('font-weight="600"')
    expect(svg).toContain('font-style="italic"')
    expect(svg).toContain('text-decoration="underline"')
    // Both runs survive, so no text is dropped.
    expect(svg).toContain('Q1 ')
    expect(svg).toContain('total')
  })

  it('bolds a header row, which this path used to drop', () => {
    expect(withTable({ hasHeader: true, cells: { '0,0': 'Name' } })).toContain('font-weight="600"')
  })

  it('lets a run un-bold a header cell', () => {
    const svg = withTable({
      hasHeader: true,
      cells: { '0,0': 'Name' },
      cellRuns: { '0,0': [{ text: 'Name', bold: false }] },
    })
    expect(svg).not.toContain('font-weight="600"')
  })

  it('escapes run text like any other persisted value', () => {
    const svg = withTable({
      cells: { '0,0': '</text><script>x' },
      cellRuns: { '0,0': [{ text: '</text><script>x', bold: true }] },
    })
    expect(svg).not.toContain('<script>')
  })

  it('ignores runs that disagree with the cell text', () => {
    const svg = withTable({
      cells: { '0,0': 'REAL-TEXT' },
      cellRuns: { '0,0': [{ text: 'STALE-RUNS', bold: true }] },
    })
    expect(svg).toContain('REAL-TEXT')
    expect(svg).not.toContain('STALE-RUNS')
  })
})

// #468: pentagon, hexagon, block arrow and star had no branch in this file at all
// and fell through to the <rect> fallback, so they exported as plain rectangles in
// PNG/PDF export, the saved thumbnail, the home tiles and the minimap — while
// drawing correctly on the canvas. The geometry is shared with ShapeView now.
describe('documentToSvg — preset polygon shapes (#468)', () => {
  // 200x100 at the origin, matching the box the geometry unit tests use.
  function presetDoc(type) {
    return {
      schemaVersion: 2,
      diagramType: 'block',
      themePreset: 'ocean',
      canvas: { width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [],
      shapes: [
        {
          id: 's1', type, x: 0, y: 0, w: 200, h: 100, rotation: 0, opacity: 1, zIndex: 1,
          fill: '#EFF6FF', border: { color: '#4F94FF', width: 2 },
          text: { content: '', style: {} },
        },
      ],
      mindmap: null, flowchart: null, whiteboard: null,
    }
  }

  it('exports each preset as its own outline, not as a rectangle', () => {
    const expected = {
      hexagon: '50,0 150,0 200,50 150,100 50,100 0,50',
      pentagon: '100,0 200,38 164,100 36,100 0,38',
      arrow: '0,30 124,30 124,0 200,50 124,100 124,70 0,70',
    }
    for (const [type, points] of Object.entries(expected)) {
      const svg = documentToSvg(presetDoc(type))
      expect(svg, `${type} did not export its outline`).toContain(`<polygon points="${points}"`)
      // The fallback drew the shape's own fill onto a <rect>. Nothing should.
      expect(svg, `${type} still exports a rectangle`).not.toMatch(/<rect[^>]*#EFF6FF/)
    }
  })

  it('exports a star as a ten-vertex outline', () => {
    const svg = documentToSvg(presetDoc('star'))
    const match = svg.match(/<polygon points="([^"]+)"/)
    expect(match, 'the star did not export as a polygon').not.toBeNull()
    expect(match[1].split(' ')).toHaveLength(10)
    expect(svg).not.toMatch(/<rect[^>]*#EFF6FF/)
  })

  // The canvas reads the same function, so this is the property that stops the two
  // drifting apart again rather than a second copy of the numbers.
  it('draws the export from the same geometry the canvas uses', () => {
    for (const type of ['hexagon', 'pentagon', 'arrow', 'star']) {
      const shape = { type, x: 0, y: 0, w: 200, h: 100 }
      expect(documentToSvg(presetDoc(type))).toContain(`<polygon points="${presetPolygonPoints(shape)}"`)
    }
  })
})

// #518: an inserted image was missing from the minimap — and therefore from the
// export and the saved thumbnail too, since all three read this one function. It
// had no `image` branch, so it fell through to the <rect> at the end carrying its
// own fill and border, which for an image are 'none' and zero: nothing to see.
describe('documentToSvg — inserted images (#518)', () => {
  const SRC = '/files/photo.png'
  function imageDoc(src = SRC) {
    return {
      schemaVersion: 2,
      diagramType: 'block',
      themePreset: 'ocean',
      canvas: { width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [],
      shapes: [
        {
          id: 's1', type: 'image', src, x: 40, y: 60, w: 200, h: 100,
          rotation: 0, opacity: 1, zIndex: 1,
          fill: 'none', border: { color: 'none', width: 0 },
          text: { content: '', style: {} },
        },
      ],
      mindmap: null, flowchart: null, whiteboard: null,
    }
  }

  it('draws the image at its own box, matching the canvas aspect rule', () => {
    const svg = documentToSvg(imageDoc())
    expect(svg).toContain(`<image href="${SRC}"`)
    expect(svg).toContain('x="40" y="60" width="200" height="100"')
    // ShapeView uses the same rule; a different one would crop or stretch the
    // export relative to what was on screen.
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"')
  })

  it('swaps in inlined bytes when the caller supplies them', () => {
    const dataUri = 'data:image/png;base64,AAAA'
    const svg = documentToSvg(imageDoc(), { images: { [SRC]: dataUri } })
    expect(svg).toContain(`<image href="${dataUri}"`)
    expect(svg).not.toContain(SRC)
  })

  it('does not write through to the caller’s document', () => {
    // parseDiagramDocument returns the object it was given, which on the export
    // path is the live store document — inlining must not reach it.
    const doc = imageDoc()
    documentToSvg(doc, { images: { [SRC]: 'data:image/png;base64,AAAA' } })
    expect(doc.shapes[0].src).toBe(SRC)
  })

  it('draws nothing for a src that is not same-origin or inline', () => {
    // safeImageSrc's rule: an external host in a shared diagram would phone home
    // on every open. Better to omit the image than to fetch from it.
    for (const bad of ['https://evil.example/x.png', 'javascript:alert(1)', '//evil.example/x.png']) {
      expect(documentToSvg(imageDoc(bad))).not.toContain('<image')
    }
  })

  it('keeps a crafted src inside its attribute', () => {
    const crafted = '/files/a" onload="alert(1)'
    const svg = documentToSvg(imageDoc(crafted))
    expect(svg).not.toContain('onload="alert(1)"')
    expect(svg).toContain('&quot;')
  })

  // The point of the issue: images were the SECOND type to fall through the same
  // default. This is the guard that stops there being a third.
  it('gives every shape type in the catalogue an element of its own', () => {
    const types = [
      'rectangle', 'rounded', 'ellipse', 'triangle', 'diamond',
      'hexagon', 'pentagon', 'arrow', 'star', 'image',
    ]
    for (const type of types) {
      const doc = imageDoc()
      Object.assign(doc.shapes[0], { type, fill: '#EFF6FF', border: { color: '#4F94FF', width: 2 } })
      const svg = documentToSvg(doc)
      const isPlainBox = type === 'rectangle' || type === 'rounded'
      if (isPlainBox) expect(svg, `${type} should be a rect`).toMatch(/<rect[^>]*#EFF6FF/)
      else expect(svg, `${type} fell through to a bare rectangle`).not.toMatch(/<rect[^>]*#EFF6FF/)
    }
  })
})

// The other half of #518: a file_url is right on screen and wrong in a file. A
// downloaded SVG holding a site path renders only for someone logged into that
// site, and the raster path is worse — rasterize draws the markup through an
// <img>, where an SVG runs in the browser's restricted mode and fetches no
// external reference at all, so a url would have produced a blank box.
describe('inlinedImages (#518)', () => {
  function docWith(...srcs) {
    return {
      schemaVersion: 2,
      diagramType: 'block',
      themePreset: 'ocean',
      canvas: { width: 1280, height: 720, background: 'none' },
      sections: [],
      connectors: [],
      shapes: srcs.map((src, i) => ({
        id: `s${i}`, type: 'image', src, x: 0, y: 0, w: 10, h: 10,
        rotation: 0, opacity: 1, zIndex: 1,
        fill: 'none', border: { color: 'none', width: 0 }, text: { content: '', style: {} },
      })),
      mindmap: null, flowchart: null, whiteboard: null,
    }
  }

  // A stand-in for the browser pair the real one uses.
  function stubLoading({ ok = true } = {}) {
    const fetched = []
    vi.stubGlobal('fetch', (url) => {
      fetched.push(url)
      return Promise.resolve({ ok, blob: () => Promise.resolve({ url }) })
    })
    vi.stubGlobal('FileReader', class {
      readAsDataURL(blob) {
        this.result = `data:image/png;base64,${blob.url}`
        queueMicrotask(() => this.onload())
      }
    })
    return fetched
  }
  afterEach(() => vi.unstubAllGlobals())

  it('is null for a document with no images, so nothing is fetched', async () => {
    const fetched = stubLoading()
    expect(await inlinedImages(docWith())).toBeNull()
    expect(fetched).toHaveLength(0)
  })

  it('maps each src to its bytes, fetching a repeated one only once', async () => {
    const fetched = stubLoading()
    const images = await inlinedImages(docWith('/files/a.png', '/files/b.png', '/files/a.png'))
    expect(Object.keys(images).sort()).toEqual(['/files/a.png', '/files/b.png'])
    expect(images['/files/a.png']).toBe('data:image/png;base64,/files/a.png')
    expect(fetched).toHaveLength(2)
  })

  it('skips an src that is already inline, and one it would refuse to draw', async () => {
    const fetched = stubLoading()
    await inlinedImages(docWith('data:image/png;base64,AAAA', 'https://evil.example/x.png'))
    expect(fetched).toHaveLength(0)
  })

  // An image whose file was deleted must not take the whole export down with it.
  it('leaves a failed fetch out of the map rather than throwing', async () => {
    stubLoading({ ok: false })
    expect(await inlinedImages(docWith('/files/gone.png'))).toBeNull()
  })
})
