import { describe, it, expect, beforeEach } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { resolveChromeType } from '@/composables/useSelectionContext.js'

// Regression tests for #416: a sticky note stayed selected while another element
// was being edited, and the toolbar's colour landed on the sticky instead.
//
// The cause is that shapes and whiteboard objects live in two separate selection
// arrays. resolveChromeType gives the whiteboard array priority on a unified
// document, so a sticky left behind in it kept owning the toolbar no matter what
// the user clicked next. The two selections are mutually exclusive now — except
// for Select All, which deliberately takes both.

function whiteboardStore() {
  const store = createDiagramStore(createDiagramDocument(undefined, 'whiteboard'))
  useWhiteboardUi(store) // the binding EditorShell makes for a live document
  return store
}

describe('one selection at a time', () => {
  let ui

  beforeEach(() => {
    ui = useWhiteboardUi()
    ui.clearSelection()
  })

  it('drops the sticky when a shape is selected', () => {
    const store = whiteboardStore()
    const shape = store.addShape({ x: 0, y: 0 })
    ui.selectSticky('sticky-1')

    store.select([shape])

    expect(ui.state.selection, 'the sticky kept the toolbar and took the colour').toEqual([])
    expect(store.state.selection).toEqual([shape])
  })

  it('drops the shape when a sticky is selected', () => {
    const store = whiteboardStore()
    const shape = store.addShape({ x: 0, y: 0 })
    store.select([shape])

    ui.selectSticky('sticky-1')

    expect(store.state.selection).toEqual([])
    expect(ui.state.selection).toEqual([{ kind: 'sticky', id: 'sticky-1' }])
  })

  it('drops the sticky when a shape joins the selection with Shift', () => {
    const store = whiteboardStore()
    const shape = store.addShape({ x: 0, y: 0 })
    ui.selectSticky('sticky-1')

    store.addToSelection([shape])

    expect(ui.state.selection).toEqual([])
  })

  it('leaves the whiteboard alone when the shape selection is only cleared', () => {
    // Clicking empty canvas clears the shapes; the press that follows may well be
    // what selects a sticky, so clearing must not reach across.
    const store = whiteboardStore()
    ui.selectSticky('sticky-1')

    store.clearSelection()

    expect(ui.state.selection).toHaveLength(1)
  })

  it('still selects both kinds for Select All', () => {
    // Cmd+A then Delete has to clear the board as well as the shapes (T1).
    const store = whiteboardStore()
    const shape = store.addShape({ x: 0, y: 0 })
    store.state.whiteboard.stickyNotes.push({ id: 'sticky-1', x: 0, y: 0, w: 10, h: 10 })

    store.selectAll()

    expect(store.state.selection).toContain(shape)
    expect(ui.state.selection).toEqual([{ kind: 'sticky', id: 'sticky-1' }])
  })
})

describe('the toolbar follows the live selection', () => {
  it('hands the chrome back to the shape once the sticky is dropped', () => {
    const store = whiteboardStore()
    const unified = { ...store.state, diagramType: 'unified' }
    const ui = useWhiteboardUi()
    ui.clearSelection()
    const shape = store.addShape({ x: 0, y: 0 })

    ui.selectSticky('sticky-1')
    expect(resolveChromeType({ state: unified }, ui, 'block')).toBe('whiteboard')

    store.select([shape])
    unified.selection = store.state.selection

    expect(resolveChromeType({ state: unified }, ui, 'block')).toBe('block')
  })
})
