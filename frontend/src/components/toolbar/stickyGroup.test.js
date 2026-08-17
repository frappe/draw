import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Source-inspected, like the other toolbar-group guards: the browser-free node env
// cannot mount these (cf. canvasToolbar.test.js). Comments stripped, because the
// ones in this component name the menu it no longer has.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'groups/StickyGroup.vue'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const template = source.slice(source.indexOf('<template>'))

// #500 put strikethrough on the bar and removed Duplicate and the "More" menu that
// held them — reversing #419 and the 13 Aug decision, deliberately and on the
// record. #501 then gave the note the FULL text-box options, so strikethrough is
// one of four marks rather than a control of its own.
//
// Both sets of guarantees are asserted here: #500's removals still hold, and #501's
// controls are present.
describe('the sticky note controls (#500, #501)', () => {
  it('offers the same four marks a text box does', () => {
    for (const mark of ['bold', 'italic', 'underline', 'strike']) {
      expect(source, `${mark} is missing`).toContain(`mark: '${mark}'`)
    }
    expect(source).toContain('icon: \'lucide-strikethrough\'')
  })

  it('offers no Duplicate — copy and paste covers it (#500)', () => {
    expect(template).not.toContain('label="Duplicate"')
    expect(source).not.toContain('function duplicate')
    expect(source).not.toContain('addStickyNote')
  })

  it('keeps the "More" menu gone, rather than reinstating it (#500)', () => {
    expect(template).not.toContain('More sticky note actions')
    // The one Popover left is the text-colour grid, which is a picker rather than
    // a menu of actions — the thing #500 removed.
    expect(template).toContain('label="Note text colour"')
  })

  it('gives the note size, alignment and text colour (#501)', () => {
    expect(template).toContain('Decrease note font size')
    expect(template).toContain('Increase note font size')
    expect(source).toContain("value: 'center'")
    expect(template).toContain('EspressoSwatchGrid')
  })

  it('keeps the paper colours off the Espresso grid, deliberately (#495)', () => {
    // Six named note-paper fills from the spec, not ink. The TEXT colour above is
    // the axis that belongs on the shared grid.
    expect(source).toContain('STICKY_COLORS')
    expect(template).toContain('v-for="color in stickyColors"')
  })

  it('shows which marks the note carries, and keeps Delete', () => {
    expect(template).toContain(':active="markActive(option.mark)"')
    expect(template).toContain('label="Delete"')
  })

  // #501 replaces the note-wide boolean with a real mark. Writing through
  // setStickyRuns is what migrates a legacy `strike: true` note the first time
  // anything touches it.
  it('writes marks as runs rather than as a note-wide flag', () => {
    expect(source).toContain('store.setStickyRuns')
    expect(source).not.toContain('{ strike: !note.value.strike }')
  })
})
