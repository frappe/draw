import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The canvas toolbar's structural contract (#359 / #360). This repo keeps unit
// tests browser-free (node env, no @vue/test-utils), so these are asserted by
// source inspection, the same way ShareMenu.test.js does.
//
// Everything pinned here is something that breaks silently: the bar still
// renders, the button still clicks, and the fault only shows up as a missing
// label, a lost caret, or a toolbar back on top of the title bar.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')

// Prose in a <script setup> comment matches the same words the markup does, so
// structural assertions read the template block only.
const templateOf = (source) => source.slice(source.indexOf('<template>'))

describe('ToolbarButton', () => {
  const source = read('ToolbarButton.vue')

  // frappe-ui's Button resolves its text as `slots.default?.() ?? props.label`.
  // An unconditional <slot /> registers an empty default slot, which is not
  // nullish, so the label silently disappears and every text entry on the bar
  // renders as a bare icon.
  it('forwards the default and icon slots only when the caller passed one', () => {
    expect(source).toContain('<template v-if="$slots.default" #default><slot /></template>')
    expect(source).toContain('<template v-if="$slots.icon" #icon><slot name="icon" /></template>')
  })

  // Clicking Bold while a shape's label is being edited must not blur the text
  // editor. The bar is far from the shape now, so the pointer crosses the canvas
  // to reach it and losing the caret is that much more disruptive.
  it('never takes focus on mousedown', () => {
    expect(source).toContain('@mousedown.prevent')
  })

  // A Popover renders #trigger through reka's PopoverTrigger as-child, which
  // merges its listeners onto the ONE child element. Wrapping Button in a
  // <Tooltip> swallows them and the popover silently never opens, so the tooltip
  // has to ride on Button's own prop instead.
  it('keeps Button as the root so a Popover trigger still receives its listeners', () => {
    const template = templateOf(source)
    expect(template).not.toMatch(/<Tooltip[\s>]/)
    expect(template).toMatch(/^\s*<template>\s*<Button/)
    expect(template).toContain(':tooltip="tooltip || label"')
  })

  // The guard is right for controls that act on the live text editor and wrong
  // for controls that insert. Holding focus on an insert control left a freshly
  // placed mind-map node still in edit mode, so the next canvas click landed in
  // its editor instead of placing a second node (#364).
  it('lets insert and tool controls opt out of the focus guard', () => {
    expect(source).toContain('allowsBlur: { type: Boolean, default: false }')
    expect(templateOf(source)).toContain(
      '@mousedown="allowsBlur ? undefined : $event.preventDefault()"',
    )
  })

  // Pressed state belongs in the accessibility tree, not only in the paint. This
  // is also what frappe-ui's own EditorFixedMenu does.
  it('shows pressed state through aria-pressed rather than a variant swap', () => {
    expect(source).toContain(':aria-pressed="active"')
    expect(source).toContain('aria-pressed:bg-surface-gray-3')
    expect(source).not.toContain("active ? 'subtle' : 'ghost'")
  })

  // 29 controls in the editor still have no accessible name (#176). Making the
  // prop required is what stops the toolbar rebuild from adding more.
  it('requires a label, so no control can ship unnamed', () => {
    expect(source).toContain('label: { type: String, required: true }')
  })
})

describe('CanvasToolbar placement', () => {
  const shell = read('../../pages/EditorShell.vue')
  const toolbar = read('CanvasToolbar.vue')

  // Below the title bar and above the canvas, as a sibling of the canvas row so
  // it spans the comments panel too. The eight bars it replaces anchored
  // themselves above the selection, which put them over the title bar whenever
  // the selected object sat near the top of the canvas.
  it('sits between the title bar and the canvas row', () => {
    const top = shell.indexOf('<TopToolbar')
    const bar = shell.indexOf('<CanvasToolbar />')
    const row = shell.indexOf('<div class="flex min-h-0 flex-1">')
    expect(top).toBeGreaterThan(-1)
    expect(bar).toBeGreaterThan(top)
    expect(row).toBeGreaterThan(bar)
  })

  // A static bar must not re-anchor to the selection. If any of these come back,
  // it has stopped being static.
  it('does not position itself against the canvas', () => {
    expect(toolbar).not.toContain('useCanvasToolbarStyle')
    expect(toolbar).not.toContain('Teleport')
    // Scoped to class attributes: `fixed` also appears in the data-slot hook
    // this bar deliberately shares with frappe-ui's EditorFixedMenu.
    expect(toolbar).not.toMatch(/class="[^"]*\bfixed\b/)
  })

  it('keeps a fixed height and does not shrink with the canvas', () => {
    expect(toolbar).toContain('h-10')
    expect(toolbar).toContain('flex-none')
  })
})

describe('who opts out of the focus guard', () => {
  // Formatting acts on the live editor and must hold the caret; inserting has to
  // let the edit commit first. Getting these two backwards is silent either way —
  // a lost caret, or a node that never lands.
  it('insert and tool controls allow the blur', () => {
    for (const file of ['groups/InsertGroups.vue', 'groups/PointerGroup.vue', 'groups/HistoryGroup.vue', '../floating/WhiteboardTools.vue']) {
      expect(read(file), `${file} must let an in-progress edit commit`).toContain('allows-blur')
    }
  })

  it('formatting controls do not', () => {
    for (const file of ['groups/TextGroup.vue', 'groups/StyleGroup.vue', 'groups/ArrangeGroup.vue']) {
      expect(read(file), `${file} must not blur the text editor`).not.toContain('allows-blur')
    }
  })
})

describe('undo and redo', () => {
  const group = read('groups/HistoryGroup.vue')
  const toolbar = read('CanvasToolbar.vue')

  // The store has carried undo/redo and canUndo/canRedo since the start, and
  // until now nothing but useKeyboard called them. A user who did not know the
  // shortcut had no way back from a mistake.
  it('reaches the history the keyboard has been the only route to', () => {
    expect(group).toContain('store.undo()')
    expect(group).toContain('store.redo()')
  })

  // Disabled off the store's own computeds. A live Undo on an empty history is
  // a control that does nothing when clicked.
  it('disables each end of the history at its end', () => {
    expect(group).toContain(':disabled="!store.canUndo"')
    expect(group).toContain(':disabled="!store.canRedo"')
  })

  // Neither is a toggle, so neither claims a pressed state (#365).
  it('claims no pressed state', () => {
    expect(group).not.toContain(':active=')
  })

  // Ahead of everything contextual, so they hold one position whatever is
  // selected. Slides, Docs and Figma all lead with them.
  it('leads the bar', () => {
    const template = templateOf(toolbar)
    expect(template.indexOf('<HistoryGroup />')).toBeLessThan(template.indexOf('<PointerGroup />'))
  })
})

describe('canvas-level controls', () => {
  const group = read('groups/CanvasGroup.vue')

  // store.applyTheme had no caller at all: design/SPEC.md lists theme presets as
  // a canvas control, but they lost their home when the right palette was
  // replaced by floating selection editors.
  it('reaches applyTheme, which nothing else does', () => {
    expect(group).toContain('store.applyTheme(preset.name)')
  })

  // A dotted grid is not wanted on a whiteboard (Q4).
  it('hides guides on a whiteboard', () => {
    expect(group).toContain("modeStrategy?.value?.type !== 'whiteboard'")
  })

  it('no longer leaves a duplicate guides control in the viewport group', () => {
    expect(read('../floating/ViewportControls.vue')).not.toContain('GuidesMenu')
  })
})
