import { describe, it, expect, vi } from 'vitest'

// useKeyboard pulls in the clipboard, text editing and the per-type key handlers,
// which reach for frappe-ui and browser APIs. Only the mode resolution is under test
// here, so stub the module boundary rather than booting an editor.
vi.mock('frappe-ui', () => ({ call: () => Promise.resolve({}), toast: { error() {}, success() {} } }))

const { effectiveKeyboardMode } = await import('./useKeyboard.js')
const { getModeStrategy } = await import('@/stores/useModeStrategy.js')

// The keyboard has to agree with the rest of the editor about which type is live.
// EditorShell resolves its mode strategy as `focusedFrame || diagramType`; the
// keyboard dispatcher read `diagramType` ALONE, and since there is no 'unified'
// strategy (getModeStrategy falls back to block) every per-type handler was
// unreachable on a unified document — inside a mind-map frame, nodes selected and
// the toolbar appeared but Tab / Enter / arrows / Delete all did nothing, and those
// keys are the only way to grow a mind map.
const store = (diagramType) => ({ state: { diagramType } })
const ui = (focusedFrame) => ({ state: { focusedFrame } })

describe('effectiveKeyboardMode', () => {
  it('is the document type when no frame is focused', () => {
    expect(effectiveKeyboardMode(store('mindmap'), ui(null))).toBe('mindmap')
    expect(effectiveKeyboardMode(store('whiteboard'), ui(null))).toBe('whiteboard')
    expect(effectiveKeyboardMode(store('unified'), ui(null))).toBe('unified')
  })

  it('is the focused frame on a unified document', () => {
    expect(effectiveKeyboardMode(store('unified'), ui('mindmap'))).toBe('mindmap')
    expect(effectiveKeyboardMode(store('unified'), ui('flowchart'))).toBe('flowchart')
  })

  it('tolerates a missing editorUi', () => {
    expect(effectiveKeyboardMode(store('block'), undefined)).toBe('block')
  })

  // The regression itself, stated as the invariant that was violated: a focused frame
  // must resolve to that sub-model's keyboard strategy, not to block's.
  it('resolves a focused frame to the sub-model strategy, not the block fallback', () => {
    const focused = getModeStrategy(effectiveKeyboardMode(store('unified'), ui('mindmap')))
    expect(focused.keyboardMode).toBe('mindmap')

    // What the old code did, kept explicit so the difference is visible.
    expect(getModeStrategy('unified').keyboardMode).toBe('block')
  })
})
