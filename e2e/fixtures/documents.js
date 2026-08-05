// Document builders for E2E setup.
//
// Specs seed content through the REST API rather than clicking it into existence.
// That is not just faster: several surfaces render an EMPTY STATE until the
// document has content (the minimap shows a placeholder, so a click-through test
// silently exercises degenerate bounds of {x:0,y:0,w:1,h:1}), and a mind-map
// document deliberately starts with rootId: null and no nodes at all.
//
// These mirror frontend/src/diagram/schema.js. Keep them in step with it: a spec
// that seeds a stale shape is testing nothing useful.

const CANVAS = {
  sizePreset: 'Widescreen 16:9',
  width: 1280,
  height: 720,
  background: 'none',
}

function baseDocument(diagramType) {
  return {
    schemaVersion: 1,
    diagramType,
    canvas: { ...CANVAS },
    shapes: [],
    connectors: [],
    sections: [],
    mindmap: null,
    flowchart: null,
    whiteboard: null,
  }
}

export function rect(id, x, y, w = 200, h = 120, extra = {}) {
  return {
    id,
    type: 'rectangle',
    x,
    y,
    w,
    h,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: '#EFF6FF',
    border: { color: '#4F94FF', width: 2, style: 'solid' },
    text: { content: '', style: {} },
    ...extra,
  }
}

export function emptyMindmap(origin = { x: 0, y: 0 }) {
  return { rootId: null, nodes: [], crosslinks: [], layout: 'balanced', origin }
}

export function emptyFlowchart(origin = { x: 0, y: 0 }) {
  return { direction: 'TB', nodes: [], edges: [], origin }
}

export function emptyWhiteboard() {
  return { strokes: [], stickyNotes: [], lines: [], tables: [], sketchStyle: false }
}

// A root plus three branches — enough for navigation, cross-links and focus mode.
export function seededMindmap(origin = { x: 0, y: 0 }) {
  return {
    rootId: 'm1',
    layout: 'balanced',
    origin,
    crosslinks: [],
    nodes: [
      { id: 'm1', parentId: null, text: 'Root', depth: 0, order: 0, side: null },
      { id: 'm2', parentId: 'm1', text: 'Branch A', depth: 1, order: 0, side: 'right' },
      { id: 'm3', parentId: 'm1', text: 'Branch B', depth: 1, order: 1, side: 'right' },
      { id: 'm4', parentId: 'm1', text: 'Branch C', depth: 1, order: 2, side: 'left' },
    ],
  }
}

export function seededFlowchart(origin = { x: 0, y: 0 }) {
  return {
    direction: 'TB',
    origin,
    nodes: [
      { id: 'f1', nodeType: 'terminator', text: 'Start', x: 100, y: 60, w: 150, h: 60, fill: null, border: null, manuallyPositioned: false, branches: [] },
      { id: 'f2', nodeType: 'process', text: 'Do work', x: 100, y: 200, w: 160, h: 72, fill: null, border: null, manuallyPositioned: false, branches: [] },
      { id: 'f3', nodeType: 'decision', text: 'OK?', x: 100, y: 340, w: 150, h: 96, fill: null, border: null, manuallyPositioned: false, branches: [{ port: 'yes', label: 'Yes' }, { port: 'no', label: 'No' }] },
    ],
    edges: [
      { id: 'fe1', from: { nodeId: 'f1', port: 'out' }, to: { nodeId: 'f2', port: 'in' }, label: '', arrowheads: { start: false, end: true }, routing: 'orthogonal', kind: 'flow' },
      { id: 'fe2', from: { nodeId: 'f2', port: 'out' }, to: { nodeId: 'f3', port: 'in' }, label: '', arrowheads: { start: false, end: true }, routing: 'orthogonal', kind: 'flow' },
    ],
  }
}

// A board carrying a LINE and a TABLE as well as ink. Both were omitted from the
// export path entirely until #40, so they need their own seeded content — the
// default board has neither, and a spec using it cannot notice their absence.
export function whiteboardWithObjects() {
  return {
    ...seededWhiteboard(),
    lines: [{ id: 'wl1', x1: 300, y1: 500, x2: 620, y2: 500, color: '#AA0011', width: 3, start: 'none', end: 'arrow' }],
    tables: [
      { id: 'wt1', x: 300, y: 560, rows: 2, cols: 2, cellW: 120, cellH: 40, color: '#00AA55', cells: { '0,0': 'CELL-TEXT' } },
    ],
  }
}

export function seededWhiteboard() {
  return {
    strokes: [
      {
        id: 'w1',
        points: Array.from({ length: 12 }, (_, i) => ({ x: 200 + i * 40, y: 260 + (i % 3) * 60 })),
        color: '#171717',
        width: 3,
        kind: 'pen',
      },
    ],
    stickyNotes: [{ id: 'w2', x: 700, y: 200, w: 180, h: 180, color: '#FEF3C7', text: 'note' }],
    lines: [],
    tables: [],
    sketchStyle: false,
  }
}

// --- per-type documents ------------------------------------------------------

// One attribute value that closes the attribute it lands in, closes the element, and
// injects a handler that fires on its own. Two payloads, because the two injection
// sites parse in different contexts and a single one gives a FALSE PASS in the other:
//
//   - <script> is useless in both. Markup assigned through innerHTML — which is what
//     v-html does — never executes script tags.
//   - <img onerror> fires in the rich-text foreignObject, which is HTML content.
//   - Inside the tile preview's <svg> subtree <img> is not an HTML image element and
//     never errors, so that one needs an SVG animation element instead.
const BREAKOUT =
  '0"/><img src="x" onerror="window.__xss=1"/>' +
  '<animate attributeName="x" dur="0.1s" onbegin="window.__xss=1"/><rect x="0'

export const documents = {
  block: (opts = {}) => ({
    ...baseDocument('block'),
    shapes: opts.empty ? [] : [rect('s1', 120, 140), rect('s2', 700, 460)],
  }),

  mindmap: (opts = {}) => ({
    ...baseDocument('mindmap'),
    mindmap: opts.empty ? emptyMindmap() : seededMindmap(),
  }),

  flowchart: (opts = {}) => ({
    ...baseDocument('flowchart'),
    flowchart: opts.empty ? emptyFlowchart() : seededFlowchart(),
  }),

  whiteboard: (opts = {}) => ({
    ...baseDocument('whiteboard'),
    whiteboard: opts.empty
      ? emptyWhiteboard()
      : opts.objects
        ? whiteboardWithObjects()
        : seededWhiteboard(),
  }),

  // The unified canvas holds every sub-model at once. Frame origins are kept
  // apart so an inserted mind map and flowchart don't land stacked.
  //
  // `withFrames` uses the document's spread-out default origins, which is what an
  // inserted frame looks like — but they fall OUTSIDE the initial view, so nothing
  // inside them can be clicked. `framesInView` seeds the same content at origins
  // within the window, for any test that has to interact with a frame.
  // page.mouse silently ignores out-of-window coordinates, so getting this wrong
  // yields a test that passes while doing nothing at all — see boxInWindow().
  unified: (opts = {}) => ({
    ...baseDocument('unified'),
    shapes: opts.empty ? [] : [rect('s1', 120, 140), rect('s2', 700, 460)],
    mindmap: opts.framesInView
      ? seededMindmap({ x: 60, y: 600 })
      : opts.withFrames
        ? seededMindmap({ x: 0, y: 900 })
        : emptyMindmap({ x: 0, y: 900 }),
    flowchart: opts.framesInView
      ? seededFlowchart({ x: 1000, y: 60 })
      : opts.withFrames
        ? seededFlowchart({ x: 1500, y: 0 })
        : emptyFlowchart({ x: 1500, y: 0 }),
    whiteboard: opts.empty ? emptyWhiteboard() : seededWhiteboard(),
  }),

  // A document as a HOSTILE author would post it. save_diagram takes whatever JSON a
  // client sends and parseDiagramDocument coerces nothing, so every one of these
  // fields arrives at the renderers verbatim. Diagrams get shared and made public, so
  // this is markup one user hands to another user's browser.
  //
  // Payloads set window.__xss rather than calling alert(), because a real alert()
  // would block the page and be indistinguishable from a hang.
  hostile: () => ({
    ...baseDocument('unified'),
    shapes: [
      // Rich text is v-html'd by ShapeView — the most direct path.
      rect('h1', 120, 140, 260, 160, {
        text: { content: 'plain fallback', html: '<p>rich <img src=x onerror="window.__xss=1"> text</p>', style: {} },
      }),
      // Colours and geometry are interpolated into SVG attributes by useThumbnail,
      // whose output the home and trash tiles inject with v-html.
      // The breakout injects an <img onerror>, not a <script>: markup set through
      // innerHTML never runs its script tags, but it DOES fire image error handlers,
      // so a payload that only used <script> would pass against vulnerable code.
      rect('h2', 420, 140, 200, 120, { fill: BREAKOUT, text: { content: 'bad fill', style: {} } }),
      rect('h3', 660, 140, 200, 120, { x: BREAKOUT, text: { content: 'bad geometry', style: {} } }),
    ],
    whiteboard: {
      ...emptyWhiteboard(),
      strokes: [{ id: 'hw1', points: [{ x: BREAKOUT, y: 0 }, { x: 200, y: 200 }], color: BREAKOUT, width: 3, kind: 'pen' }],
      stickyNotes: [{ id: 'hw2', x: 700, y: 400, w: 180, h: 180, color: BREAKOUT, text: 'bad sticky' }],
    },
    mindmap: { ...seededMindmap({ x: 0, y: 900 }) },
    flowchart: emptyFlowchart({ x: 1500, y: 0 }),
  }),
}
