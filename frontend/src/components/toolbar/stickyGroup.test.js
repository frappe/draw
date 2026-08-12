import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Source-inspected, like the other toolbar-group guards: the browser-free node env
// cannot mount these (cf. canvasToolbar.test.js).
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'groups/StickyGroup.vue'), 'utf8')
const template = source.slice(source.indexOf('<template>'))

// #419: strikethrough held a permanent slot beside the colours on a bar that is
// already at its width limit, for something you do once to a note you have
// finished with. It moved behind "More formatting" — but it still has to WORK,
// and the bar still has to say when a note is struck through.
describe('the sticky note\'s strikethrough (#419)', () => {
  it('is not a control on the bar any more', () => {
    const beforeMenu = template.slice(0, template.indexOf('<Popover>'))
    expect(beforeMenu, 'strikethrough is back on the bar').not.toContain('lucide-strikethrough')
  })

  it('sits behind a More entry, and still toggles the note', () => {
    const menu = template.slice(template.indexOf('<Popover>'))
    expect(menu).toContain('label="More formatting"')
    expect(menu).toContain('icon-left="lucide-strikethrough"')
    expect(menu).toContain('toggleStrike(toggle)')
  })

  // The whole risk of hiding a toggle: its state stops being visible. The trigger
  // wears it, so a struck-through note still reads as struck through with the
  // menu shut.
  it('shows the state on the closed trigger', () => {
    const trigger = template.slice(template.indexOf('#trigger'), template.indexOf('#default'))
    expect(trigger).toContain(':active="Boolean(note.strike)"')
  })

  // A one-shot action leaving its panel open would cover the rest of the group.
  it('closes the menu when it fires', () => {
    expect(source).toContain('function toggleStrike(close)')
    expect(source).toContain('close?.()')
  })

  it('leaves colour, duplicate and delete on the bar', () => {
    const beforeMenu = template.slice(0, template.indexOf('<Popover>'))
    expect(beforeMenu).toContain('v-for="color in stickyColors"')
    expect(template).toContain('label="Duplicate"')
    expect(template).toContain('label="Delete"')
  })
})
