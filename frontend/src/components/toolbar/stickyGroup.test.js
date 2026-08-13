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
// finished with. It moved behind a "More" entry — but it still has to WORK, and
// the bar still has to say when a note is struck through.
//
// Duplicate joined it there (Vibhav, 13 Aug 2026): the same kind of one-shot
// action, and a menu holding a single item was a lid on an almost empty box.
describe('the sticky note\'s More menu (#419)', () => {
  it('keeps strikethrough and duplicate off the bar', () => {
    const beforeMenu = template.slice(0, template.indexOf('<Popover>'))
    expect(beforeMenu, 'strikethrough is back on the bar').not.toContain('lucide-strikethrough')
    expect(beforeMenu, 'duplicate is back on the bar').not.toContain('label="Duplicate"')
  })

  it('holds both actions, each still doing its job', () => {
    const menu = template.slice(template.indexOf('<Popover>'))
    expect(menu).toContain('label="More sticky note actions"')
    expect(menu).toContain('icon-left="lucide-strikethrough"')
    expect(menu).toContain('toggleStrike(toggle)')
    expect(menu).toContain('icon-left="lucide-copy"')
    expect(menu).toContain('duplicate(toggle)')
  })

  // The whole risk of hiding a toggle: its state stops being visible. The trigger
  // wears it, so a struck-through note still reads as struck through with the
  // menu shut.
  it('shows the state on the closed trigger', () => {
    const trigger = template.slice(template.indexOf('#trigger'), template.indexOf('#default'))
    expect(trigger).toContain(':active="Boolean(note.strike)"')
  })

  // A one-shot action leaving its panel open would cover the rest of the group.
  it('closes the menu when either action fires', () => {
    expect(source).toContain('function toggleStrike(close)')
    expect(source).toContain('function duplicate(close)')
    expect(source.match(/close\?\.\(\)/g) || [], 'both actions must close the menu').toHaveLength(2)
  })

  it('leaves colour and delete on the bar', () => {
    const beforeMenu = template.slice(0, template.indexOf('<Popover>'))
    expect(beforeMenu).toContain('v-for="color in stickyColors"')
    expect(template).toContain('label="Delete"')
  })
})
