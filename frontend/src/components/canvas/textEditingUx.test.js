import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #259 / #263 standardise text editing. These canvas/floating components can't mount
// in the node env (house pattern — see nodeSelectionPlain.test.js), so pin the key
// behaviours by source inspection.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')

describe('drop a parent node → straight into typing (#263)', () => {
  const src = read('composables/useShapeCreation.js')

  it('seeds real "New idea" text and selects it so the first keystroke replaces it', () => {
    expect(src).toContain("beginTextEdit(rootId, { selectAll: true, seedIfEmpty: 'New idea' })")
  })

  it('adds a newline on Cmd/Ctrl+Enter as well as plain Enter', () => {
    const editor = read('components/canvas/TextEditor.vue')
    expect(editor).toContain("event.key === 'Enter' && (event.metaKey || event.ctrlKey)")
  })
})

describe('editing text shows a text-only menu, not the shape menu (#259)', () => {
  // These controls moved from the floating BlockSelectionEditor onto the static
  // canvas toolbar (#361). The behaviour is unchanged, so the assertions follow
  // them rather than being dropped: the bar the toolbar shows while a label is
  // being edited must still be text-only.
  const toolbar = read('components/toolbar/CanvasToolbar.vue')
  const textGroup = read('components/toolbar/groups/TextGroup.vue')

  it('gates the shape-only groups behind !editing', () => {
    expect(toolbar).toContain('<template v-if="!editing">')
    // Style and arrange act on the shape; text formatting stays available.
    expect(toolbar).toContain('<StyleGroup />')
    expect(toolbar).toContain('<ArrangeGroup />')
  })

  it('hides delete while a label is being edited — the target is the text, not the shape', () => {
    expect(toolbar).toContain('count.value > 0 && !editing.value')
  })

  it('offers a text colour control that recolours the selection live while editing', () => {
    expect(textGroup).toContain('label="Text colour"')
    expect(textGroup).toContain('if (editing.value) richCommands.setColor(hex)')
  })
})
