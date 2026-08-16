import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Source-inspected, like the other toolbar-group guards: the browser-free node env
// cannot mount these (cf. canvasToolbar.test.js). Comments are stripped, because
// the ones in this component name the menu it no longer has.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'groups/StickyGroup.vue'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const template = source.slice(source.indexOf('<template>'))

// #500 REVERSES #419 and the 13 Aug decision that followed it, deliberately and on
// the record so it is not re-litigated: strikethrough is a text formatting control
// and belongs on the bar with the others, and copy/paste already covers duplicating
// a note. With Duplicate gone the menu held one item, which is a lid on an empty box
// — so the menu goes too, which is what putting strikethrough on the bar means.
//
// The assertions below are the previous ones inverted. That is the justification:
// the behaviour they pinned is the behaviour the issue asked to remove.
describe('the sticky note controls (#500)', () => {
  it('puts strikethrough on the bar, where the other formatting controls are', () => {
    expect(template).toContain('icon="lucide-strikethrough"')
    expect(template).toContain('label="Strikethrough"')
    expect(template).toContain('@click="toggleStrike"')
  })

  it('offers no Duplicate — copy and paste covers it', () => {
    expect(template).not.toContain('label="Duplicate"')
    expect(source).not.toContain('function duplicate')
    // The note was copied by hand here, so the writer goes with the control.
    expect(source).not.toContain('addStickyNote')
  })

  it('drops the menu that held the two, rather than leaving a one-item popover', () => {
    expect(template).not.toContain('<Popover>')
    expect(template).not.toContain('More sticky note actions')
    expect(source).not.toContain("import { Button, Popover }")
  })

  // The reason #419 hid it was that the bar is at its width limit. Strikethrough
  // returning is one button, and it replaces a trigger that was also one button, so
  // the bar is no wider than before.
  it('costs the bar nothing: one control replaces the menu trigger', () => {
    const buttons = template.match(/<ToolbarButton/g) || []
    // colour (v-for, one tag), strikethrough, delete.
    expect(buttons).toHaveLength(3)
  })

  it('still shows whether the note is struck through', () => {
    expect(template).toContain(':active="Boolean(note.strike)"')
  })

  it('leaves colour and delete on the bar', () => {
    expect(template).toContain('v-for="color in stickyColors"')
    expect(template).toContain('label="Delete"')
  })

  // #500 keeps the model as it is: `strike` is one boolean over the whole note, not
  // a text mark. Real per-range formatting for sticky text is a model change, filed
  // separately — this moved the control and nothing else.
  it('keeps strike a note-wide boolean rather than reaching for a text mark', () => {
    expect(source).toContain('{ strike: !note.value.strike }')
    expect(source).not.toContain('richCommands')
  })
})
