import { describe, it, expect } from 'vitest'
import { useWhiteboardUi } from './useWhiteboardUi.js'

// useWhiteboardUi is a module singleton (like flowchartUi/mindmapUi). reset() runs
// at each document load so a selection or editingCell keyed by ids that repeat
// across documents can't reattach in the next one — while the tool preferences,
// which are chrome not document data, are kept (finding C2, whiteboard sibling).
describe('useWhiteboardUi reset', () => {
  it('clears document-scoped state but keeps the tool preferences', () => {
    const ui = useWhiteboardUi()
    ui.selectStroke('w9')
    ui.state.editingCell = { tableId: 't1', row: 0, col: 0 }
    ui.state.marquee = { x: 0, y: 0, w: 1, h: 1 }
    ui.liveStroke.value = { points: [] }
    ui.state.penColor = '#123456' // a preference that must survive

    ui.reset()

    expect(ui.state.selection).toEqual([])
    expect(ui.state.selected).toBeNull()
    expect(ui.state.editingCell).toBeNull()
    expect(ui.state.marquee).toBeNull()
    expect(ui.liveStroke.value).toBeNull()
    expect(ui.state.penColor, 'a tool preference must survive a reset').toBe('#123456')
  })
})
