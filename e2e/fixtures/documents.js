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
  return { strokes: [], stickyNotes: [], lines: [], tables: [], votes: {}, sketchStyle: false }
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
    votes: {},
    sketchStyle: false,
  }
}

// --- per-type documents ------------------------------------------------------

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
    whiteboard: opts.empty ? emptyWhiteboard() : seededWhiteboard(),
  }),

  // The unified canvas holds every sub-model at once. Frame origins are kept
  // apart so an inserted mind map and flowchart don't land stacked.
  unified: (opts = {}) => ({
    ...baseDocument('unified'),
    shapes: opts.empty ? [] : [rect('s1', 120, 140), rect('s2', 700, 460)],
    mindmap: opts.withFrames ? seededMindmap({ x: 0, y: 900 }) : emptyMindmap({ x: 0, y: 900 }),
    flowchart: opts.withFrames ? seededFlowchart({ x: 1500, y: 0 }) : emptyFlowchart({ x: 1500, y: 0 }),
    whiteboard: opts.empty ? emptyWhiteboard() : seededWhiteboard(),
  }),
}
