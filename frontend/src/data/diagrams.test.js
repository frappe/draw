import { describe, it, expect, beforeEach, vi } from 'vitest'

// diagrams.js builds frappe-ui resources at import; stub them so the module loads
// without a network/browser. `diagrams` becomes a plain object whose `.data` a
// test can set to stand in for the currently-loaded list, and whose insert.submit
// captures the payload so a test can assert the document that would be saved.
const inserted = vi.hoisted(() => ({ payload: null }))
vi.mock('frappe-ui', () => ({
  createListResource: () => ({
    data: [],
    insert: {
      submit: (payload) => {
        inserted.payload = payload
        return Promise.resolve({ name: 'new-diagram' })
      },
    },
  }),
  createDocumentResource: () => ({}),
}))

const { nextDiagramTitle, createDiagram, diagrams } = await import('./diagrams.js')
const { useAppSettings, resetSettings } = await import('@/composables/useAppSettings.js')

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

describe('createDiagram applies default settings (#126)', () => {
  beforeEach(() => {
    diagrams.data = []
    inserted.payload = null
    resetSettings() // isolate from the shared settings singleton
  })

  it('stamps the new document with the saved theme preset and canvas background', async () => {
    const { settings } = useAppSettings()
    settings.defaultThemePreset = 'ocean'
    settings.defaultCanvasBackground = '#F5F5F5'

    await createDiagram('Test', null, 'block')

    expect(inserted.payload.document.themePreset).toBe('ocean')
    expect(inserted.payload.document.canvas.background).toBe('#F5F5F5')
  })

  it('keeps the current defaults (slate, no background) when settings are unset', async () => {
    await createDiagram('Test', null, 'block')

    expect(inserted.payload.document.themePreset).toBe('slate')
    expect(inserted.payload.document.canvas.background).toBe(null)
  })

  // #165 review: the defaults stamp only a freshly-built document. A caller-supplied
  // template already carries its own look and must not be recoloured by the settings.
  it('leaves a caller-supplied template document untouched', async () => {
    const { settings } = useAppSettings()
    settings.defaultThemePreset = 'ocean'
    settings.defaultCanvasBackground = '#F5F5F5'

    const template = { diagramType: 'block', themePreset: 'violet', canvas: { background: '#000000' } }
    await createDiagram('Test', template, 'block')

    expect(inserted.payload.document.themePreset).toBe('violet')
    expect(inserted.payload.document.canvas.background).toBe('#000000')
  })
})
