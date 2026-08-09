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
  const src = read('components/floating/BlockSelectionEditor.vue')

  it('gates the shape-only controls behind !editing', () => {
    expect(src).toContain('<template v-if="!editing">')
    // Delete acts on the shape, so it hides while editing the label.
    expect(src).toContain('<Button v-if="!editing" variant="ghost" theme="red"')
  })

  it('offers a text colour control that recolours the selection live while editing', () => {
    expect(src).toContain('tooltip="Text colour"')
    expect(src).toContain('if (editing.value) richCommands.setColor(hex)')
  })
})
