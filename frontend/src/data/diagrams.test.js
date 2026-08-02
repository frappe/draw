import { describe, it, expect, beforeEach, vi } from 'vitest'

// diagrams.js builds frappe-ui resources at import; stub them so the module loads
// without a network/browser. `diagrams` becomes a plain object whose `.data` a
// test can set to stand in for the currently-loaded list.
vi.mock('frappe-ui', () => ({
  createListResource: () => ({ data: [] }),
  createDocumentResource: () => ({}),
}))

const { nextDiagramTitle, diagrams } = await import('./diagrams.js')

describe('nextDiagramTitle', () => {
  beforeEach(() => {
    diagrams.data = []
  })

  it('names the first of a type "<Base> 1"', () => {
    expect(nextDiagramTitle('flowchart')).toBe('Flowchart 1')
    expect(nextDiagramTitle('mindmap')).toBe('Mind map 1')
    expect(nextDiagramTitle('whiteboard')).toBe('Whiteboard 1')
    expect(nextDiagramTitle('unified')).toBe('Drawing 1')
  })

  it('falls back to "Diagram" for block and unknown types', () => {
    expect(nextDiagramTitle('block')).toBe('Diagram 1')
    expect(nextDiagramTitle('nope')).toBe('Diagram 1')
    expect(nextDiagramTitle()).toBe('Diagram 1')
  })

  it('skips numbers already taken by loaded diagrams', () => {
    diagrams.data = [{ title: 'Flowchart 1' }, { title: 'Flowchart 2' }]
    expect(nextDiagramTitle('flowchart')).toBe('Flowchart 3')
  })

  it('fills the lowest free gap, not just the highest+1', () => {
    diagrams.data = [{ title: 'Flowchart 1' }, { title: 'Flowchart 3' }]
    expect(nextDiagramTitle('flowchart')).toBe('Flowchart 2')
  })

  it('counts each type independently', () => {
    diagrams.data = [{ title: 'Flowchart 1' }, { title: 'Mind map 1' }]
    expect(nextDiagramTitle('flowchart')).toBe('Flowchart 2')
    expect(nextDiagramTitle('mindmap')).toBe('Mind map 2')
    expect(nextDiagramTitle('whiteboard')).toBe('Whiteboard 1')
  })
})
