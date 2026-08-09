import { describe, it, expect, vi } from 'vitest'
import { reactive, computed } from 'vue'

// resolveChromeType reaches keyboardOwner, which pulls in the clipboard, text
// editing and the per-type key handlers — all of which reach for frappe-ui and
// browser APIs. Stub the module boundary rather than booting an editor, the same
// way useKeyboard.test.js does.
vi.mock('frappe-ui', () => ({ call: () => Promise.resolve({}), toast: { error() {}, success() {} } }))

const { resolveChromeType, createSelectionContext } = await import('./useSelectionContext.js')

// The chrome you see and the keyboard that works must never disagree (#45), so
// these cases are the contract, not incidental behaviour. Each one is a bug that
// happened: a migrated node with no toolbar, a whiteboard line that could not be
// deleted by mouse, an overlay showing its blank-map prompt over a live document.
const doc = (diagramType, extra = {}) => ({
  state: { diagramType, selection: [], shapes: [], mindmap: null, flowchart: null, ...extra },
})
const board = (selection = []) => ({ state: { selection } })

const MINDMAP = { nodes: [{ id: 'n1' }] }
const FLOWCHART = { nodes: [{ id: 'f1' }] }
const MIGRATED_MINDMAP_NODE = { id: 's1', role: 'mindmap-node' }
const MIGRATED_FLOWCHART_NODE = { id: 's2', role: 'flowchart-node' }
const PLAIN_SHAPE = { id: 's3' }

describe('resolveChromeType — single-type documents', () => {
  it('always uses the document type, whatever is selected', () => {
    expect(resolveChromeType(doc('mindmap', { mindmap: MINDMAP }), board(), 'mindmap')).toBe('mindmap')
    expect(resolveChromeType(doc('flowchart', { flowchart: FLOWCHART }), board(), 'flowchart')).toBe('flowchart')
    expect(resolveChromeType(doc('whiteboard'), board(), 'whiteboard')).toBe('whiteboard')
    expect(resolveChromeType(doc('block'), board(), 'block')).toBe('block')
  })
})

describe('resolveChromeType — the unified canvas', () => {
  it('gives the whiteboard priority, so a line or table keeps its only Delete', () => {
    const store = doc('unified', { shapes: [PLAIN_SHAPE], selection: ['s3'] })
    expect(resolveChromeType(store, board([{ kind: 'line', id: 'l1' }]), 'block')).toBe('whiteboard')
  })

  it('gives a migrated mind-map node the BLOCK chrome, not the framed overlay', () => {
    const store = doc('unified', { shapes: [MIGRATED_MINDMAP_NODE], selection: ['s1'] })
    expect(resolveChromeType(store, board(), 'block')).toBe('block')
  })

  it('gives a migrated flowchart node the BLOCK chrome too', () => {
    const store = doc('unified', { shapes: [MIGRATED_FLOWCHART_NODE], selection: ['s2'] })
    expect(resolveChromeType(store, board(), 'block')).toBe('block')
  })

  it('follows the sub-model for a legacy node that has not migrated', () => {
    const mind = doc('unified', { mindmap: MINDMAP, selection: ['n1'] })
    expect(resolveChromeType(mind, board(), 'block')).toBe('mindmap')
    const flow = doc('unified', { flowchart: FLOWCHART, selection: ['f1'] })
    expect(resolveChromeType(flow, board(), 'block')).toBe('flowchart')
  })

  it('falls back to block for a plain shape and for an empty selection', () => {
    const shape = doc('unified', { shapes: [PLAIN_SHAPE], selection: ['s3'] })
    expect(resolveChromeType(shape, board(), 'block')).toBe('block')
    expect(resolveChromeType(doc('unified'), board(), 'block')).toBe('block')
  })
})

describe('createSelectionContext', () => {
  it('tracks the selection reactively', () => {
    const store = reactive({
      state: { diagramType: 'unified', selection: [], shapes: [MIGRATED_MINDMAP_NODE], mindmap: MINDMAP, flowchart: null },
    })
    const whiteboardUi = reactive({ state: { selection: [] } })
    const context = createSelectionContext(store, whiteboardUi, computed(() => ({ type: 'block' })))

    expect(context.chromeType.value).toBe('block')

    // A legacy mind-map node hands the chrome to the overlay …
    store.state.selection = ['n1']
    expect(context.chromeType.value).toBe('mindmap')

    // … and a whiteboard object takes it back, whatever else is selected.
    whiteboardUi.state.selection = [{ kind: 'sticky', id: 'k1' }]
    expect(context.chromeType.value).toBe('whiteboard')
  })
})
