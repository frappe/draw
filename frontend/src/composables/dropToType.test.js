import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createDiagramStore } from '@/stores/useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { useTextEditing } from '@/composables/useTextEditing.js'

// #263: dropping a Parent Node drops you straight into typing — the node is edited
// with a seeded, PRE-SELECTED "New idea" so the first keystroke replaces it, while
// Escape / clicking away keeps it. beginTextEdit carries those options on the
// session; the drop path (useShapeCreation) and the editor (TextEditor) consume them.

function storeWithShape() {
  const store = createDiagramStore(createDiagramDocument(undefined, 'unified'))
  store.addShape({ type: 'rounded', x: 0, y: 0, w: 100, h: 40 })
  return { store, id: store.state.shapes[0].id }
}

describe('drop-to-type edit options (#263)', () => {
  it('records selectAll + seedIfEmpty on the editing session', () => {
    const { store, id } = storeWithShape()
    const editing = useTextEditing(store, {})
    editing.beginTextEdit(id, { selectAll: true, seedIfEmpty: 'New idea' })
    expect(editing.session.selectAll).toBe(true)
    expect(editing.session.seedIfEmpty).toBe('New idea')
    expect(editing.editingShapeId.value).toBe(id)
  })

  it('defaults to no seed / no select-all for a plain edit', () => {
    const { store, id } = storeWithShape()
    const editing = useTextEditing(store, {})
    editing.beginTextEdit(id)
    expect(editing.session.selectAll).toBe(false)
    expect(editing.session.seedIfEmpty).toBeNull()
  })
})

const read = (rel) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), rel), 'utf8')

describe('drop-to-type wiring (#263)', () => {
  it('the dropped mind-map root is edited with "New idea" pre-selected', () => {
    const src = read('./useShapeCreation.js')
    expect(src).toContain(
      "useTextEditing(store, editorUi).beginTextEdit(rootId, { selectAll: true, seedIfEmpty: 'New idea' })",
    )
  })

  it('the editor seeds the label into an empty shape and selects it', () => {
    const src = read('../components/canvas/TextEditor.vue')
    expect(src).toContain('editing.session.seedIfEmpty')
    expect(src).toContain('if (editing.session.selectAll) editor.value.commands.selectAll()')
  })
})
