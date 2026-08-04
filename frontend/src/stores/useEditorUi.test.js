import { describe, it, expect } from 'vitest'
import { createEditorUi } from './useEditorUi.js'

// Click-to-place arming (#75). A mind map / flowchart is not a shape draw-type, so it
// rides in its own pendingStarter state alongside tool/drawShapeType. These pin the
// arming model: armStarter sets the pending starter (and drops the tool to select so
// no shape draft can start under it), and the two arming models never both hold —
// arming any tool disarms a pending starter, and vice versa.

describe('armStarter', () => {
  it('arms a mind-map starter and drops the tool to select', () => {
    const ui = createEditorUi()
    ui.setDrawShape('ellipse') // a shape tool was armed first
    ui.armStarter({ kind: 'mindmap' })
    expect(ui.state.pendingStarter).toEqual({ kind: 'mindmap' })
    expect(ui.state.tool).toBe('select')
  })

  it('arms a flowchart starter carrying the chosen node type', () => {
    const ui = createEditorUi()
    ui.armStarter({ kind: 'flowchart', nodeType: 'decision' })
    expect(ui.state.pendingStarter).toEqual({ kind: 'flowchart', nodeType: 'decision' })
  })
})

describe('a pending starter is cleared by arming any tool', () => {
  it('setDrawShape (arming a shape) disarms the starter', () => {
    const ui = createEditorUi()
    ui.armStarter({ kind: 'mindmap' })
    ui.setDrawShape('rectangle')
    expect(ui.state.pendingStarter).toBeNull()
    expect(ui.state.tool).toBe('draw')
  })

  it('setTool (switching to select/hand/…) disarms the starter', () => {
    const ui = createEditorUi()
    ui.armStarter({ kind: 'flowchart', nodeType: 'process' })
    ui.setTool('hand')
    expect(ui.state.pendingStarter).toBeNull()
    expect(ui.state.tool).toBe('hand')
  })

  it('clearStarter disarms it without touching the tool', () => {
    const ui = createEditorUi()
    ui.armStarter({ kind: 'mindmap' })
    ui.clearStarter()
    expect(ui.state.pendingStarter).toBeNull()
    expect(ui.state.tool).toBe('select')
  })
})

// Add-comment arming (#108) is a third placement mode that must never coexist with a
// draw tool or a pending starter — the same mutual-exclusion the starter has.
describe('armComment', () => {
  it('arms add-comment, drops the tool to select, and opens the panel', () => {
    const ui = createEditorUi()
    ui.setDrawShape('ellipse')
    ui.armComment()
    expect(ui.state.pendingComment).toBe(true)
    expect(ui.state.tool).toBe('select')
    expect(ui.state.commentsPanelOpen).toBe(true)
  })

  it('arming a comment disarms a pending starter (and vice versa)', () => {
    const ui = createEditorUi()
    ui.armStarter({ kind: 'mindmap' })
    ui.armComment()
    expect(ui.state.pendingStarter).toBeNull()
    expect(ui.state.pendingComment).toBe(true)

    ui.armStarter({ kind: 'flowchart', nodeType: 'process' })
    expect(ui.state.pendingComment).toBe(false)
    expect(ui.state.pendingStarter).toEqual({ kind: 'flowchart', nodeType: 'process' })
  })

  it('arming any tool clears a pending comment', () => {
    const ui = createEditorUi()
    ui.armComment()
    ui.setTool('hand')
    expect(ui.state.pendingComment).toBe(false)
  })

  it('closing the panel disarms add-comment', () => {
    const ui = createEditorUi()
    ui.armComment()
    ui.toggleCommentsPanel() // open -> closed
    expect(ui.state.commentsPanelOpen).toBe(false)
    expect(ui.state.pendingComment).toBe(false)
  })
})
