import { describe, it, expect, vi } from 'vitest'

// useKeyboard pulls in the clipboard, text editing and the per-type key handlers,
// which reach for frappe-ui and browser APIs. Only the mode resolution is under test
// here, so stub the module boundary rather than booting an editor.
vi.mock('frappe-ui', () => ({ call: () => Promise.resolve({}), toast: { error() {}, success() {} } }))

const { keyboardOwner, escape } = await import('./useKeyboard.js')
const { getModeStrategy } = await import('@/stores/useModeStrategy.js')
const { createEditorUi } = await import('@/stores/useEditorUi.js')
// Registers the mind-map handler as a side effect of import, exactly as the app
// does. Without this the mindmap slot is still null and a mind-map document would
// resolve to no owner — the test would pass for the wrong reason.
await import('./useMindmapKeys.js')

// Which per-type keyboard is live has to agree with what the user is looking at.
// A unified document has no type of its own — getModeStrategy falls back to block,
// whose handler is null — so on the unified canvas the owner comes from whichever
// model holds the selection. Before that fallback existed, every per-type handler
// was unreachable there: a mind-map node selected and its toolbar appeared, but
// Tab / Enter / arrows / Delete did nothing, and those keys are the only way to
// grow a mind map.
const doc = (diagramType, extra = {}) => ({
  state: { diagramType, selection: [], mindmap: null, flowchart: null, ...extra },
})

const MINDMAP = { nodes: [{ id: 'n1' }, { id: 'n2' }] }
const FLOWCHART = { nodes: [{ id: 'f1' }] }

describe('keyboardOwner', () => {
  it('is the document type for a single-type document', () => {
    expect(keyboardOwner(doc('mindmap', { mindmap: MINDMAP }))).toBe('mindmap')
    expect(keyboardOwner(doc('flowchart', { flowchart: FLOWCHART }))).toBe('flowchart')
    expect(keyboardOwner(doc('whiteboard'))).toBe('whiteboard')
  })

  it('is null for a block document, so the shared shape shortcuts apply', () => {
    expect(keyboardOwner(doc('block', { selection: ['s1'] }))).toBeNull()
  })

  // The regression this fallback exists for, stated as the invariant that was
  // violated: on a unified document the keys must follow the selected node.
  it('follows the selected node on a unified document', () => {
    const withBoth = { mindmap: MINDMAP, flowchart: FLOWCHART }
    expect(keyboardOwner(doc('unified', { ...withBoth, selection: ['n2'] }))).toBe('mindmap')
    expect(keyboardOwner(doc('unified', { ...withBoth, selection: ['f1'] }))).toBe('flowchart')
  })

  it('is null on a unified document with nothing selected, or a plain shape selected', () => {
    const withBoth = { mindmap: MINDMAP, flowchart: FLOWCHART }
    expect(keyboardOwner(doc('unified', withBoth))).toBeNull()
    expect(keyboardOwner(doc('unified', { ...withBoth, selection: ['s1'] }))).toBeNull()
  })

  it('tolerates a unified document whose sub-models are absent or empty', () => {
    expect(keyboardOwner(doc('unified', { selection: ['n1'] }))).toBeNull()
    expect(keyboardOwner(doc('unified', { mindmap: { nodes: [] }, selection: ['n1'] }))).toBeNull()
  })

  // Kept explicit: 'unified' resolves to the BLOCK strategy, which is why the
  // selection fallback is needed at all rather than a 'unified' keyboardMode.
  it('resolves the unified type to the block strategy', () => {
    expect(getModeStrategy('unified').keyboardMode).toBe('block')
  })
})

// Escape cancels a catalog-armed click-to-place starter (#75) before any deselect, so
// the placement cursor disappears without dropping anything. The arm carries
// tool === 'select', so escape must clear pendingStarter first rather than fall
// through to clearSelection.
describe('escape cancels a pending starter', () => {
  it('clears the armed starter without inserting or deselecting', () => {
    const editorUi = createEditorUi()
    editorUi.armStarter({ kind: 'mindmap' })
    const store = { clearSelection: vi.fn() }

    escape(store, editorUi)

    expect(editorUi.state.pendingStarter).toBeNull()
    expect(store.clearSelection).not.toHaveBeenCalled() // starter cancel takes priority
  })

  it('with nothing armed still deselects as before', () => {
    const editorUi = createEditorUi()
    const store = { clearSelection: vi.fn() }

    escape(store, editorUi)

    expect(store.clearSelection).toHaveBeenCalledTimes(1)
  })
})
