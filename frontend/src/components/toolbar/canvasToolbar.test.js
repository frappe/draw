import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
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

describe('one left-aligned run', () => {
  const toolbar = read('CanvasToolbar.vue')
  const template = templateOf(toolbar)

  // A fixed cluster on the far left and Canvas pinned to the far right left
  // about 900px of nothing between them with nothing selected, which reads as
  // broken rather than as a bar with room to spare. The spacer that produced it
  // was a `flex-1` div wrapping everything except Canvas.
  it('has no spacer holding the two ends apart', () => {
    expect(template).not.toContain('flex-1')
  })

  // The fixed prefix in order, then everything contextual after it. Growing off
  // the END is what keeps a control from moving under the pointer when the
  // selection changes — the complaint that retired the eight floating bars.
  it('puts every fixed group ahead of every contextual one', () => {
    const at = (tag) => {
      const index = template.indexOf(tag)
      expect(index, `${tag} is missing from the bar`).toBeGreaterThan(-1)
      return index
    }
    const fixed = ['<HistoryGroup', '<PointerGroup', '<InsertGroups', '<ZoomGroup', '<CanvasGroup']
    for (let i = 1; i < fixed.length; i += 1) {
      expect(at(fixed[i]), `${fixed[i]} must follow ${fixed[i - 1]}`).toBeGreaterThan(at(fixed[i - 1]))
    }
    const contextual = ['<LineGroup', '<StyleGroup', '<TextGroup', '<ArrangeGroup', '<BlockActionsGroup']
    for (const group of contextual) {
      expect(at(group), `${group} must come after the fixed prefix`).toBeGreaterThan(at('<CanvasGroup'))
    }
  })

  // Flex items shrink by default. Without this a bar with one control too many
  // squeezes every button a pixel narrower instead of overflowing, and the E2E
  // guard asserting scrollWidth === clientWidth passes on a bar that is wrong.
  it('does not let a crowded bar squash its controls instead of overflowing', () => {
    expect(read('ToolbarButton.vue')).toContain('class="shrink-0 aria-pressed:bg-surface-gray-3"')
    expect(read('ToolbarSeparator.vue')).toContain('shrink-0')
  })
})

describe('who opts out of the focus guard', () => {
  // Formatting acts on the live editor and must hold the caret; inserting has to
  // let the edit commit first. Getting these two backwards is silent either way —
  // a lost caret, or a node that never lands.
  it('insert and tool controls allow the blur', () => {
    const files = [
      'groups/InsertGroups.vue',
      'groups/PointerGroup.vue',
      'groups/HistoryGroup.vue',
      'groups/ZoomGroup.vue',
      '../floating/WhiteboardTools.vue',
    ]
    for (const file of files) {
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

describe('what folds, so the bar fits at 1280px', () => {
  // Everything the refinement round added left the bar 155px wider than a 1280px
  // screen with two shapes selected, and 187px with a mind-map node among them.
  // Each collapse below bought that back. They are pinned because re-promoting
  // any one of them silently overflows the bar again, and the E2E guard would be
  // the only thing to notice.
  it('gathers arrange, align, distribute and transform into one menu', () => {
    const group = read('groups/ArrangeGroup.vue')
    expect((group.match(/<ToolbarButton\b/g) || []).length).toBe(1)
    // Each section still gates itself, so a lone shape does not read Align.
    for (const section of ['<ArrangeSection', '<AlignSection', '<DistributeSizeSection', '<TransformSection']) {
      expect(group, `${section} must still be reachable`).toContain(section)
    }
  })

  // The trigger wears whichever alignment is set, so folding the three does not
  // also hide which one is on.
  it('gathers the three text alignments into one menu that shows the current one', () => {
    const group = read('groups/TextGroup.vue')
    expect(group).toContain(':label="currentAlignment.label"')
    expect(group).toContain(':icon="currentAlignment.icon"')
  })

  // The laser is the only tool on the bar that writes nothing to the document,
  // and it is reached in bursts rather than continuously — the cheapest of the
  // always-present controls to put one click away.
  it('moves the laser in with the pointing modes, and only renders it once', () => {
    const group = read('groups/PointerGroup.vue')
    expect(group).toContain("{ tool: 'laser', icon: 'lucide-circle-dot', label: 'Laser pointer' }")
    // e2e/specs/laser.spec.js addresses the laser by this id wherever it lives.
    expect(group).toContain("data-testid=\"'wtool-' + mode.tool\"")
    expect(read('CanvasToolbar.vue')).toContain("const ALWAYS_EXCLUDE = ['laser']")
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

  // The bottom-left viewport group is gone entirely: guides moved into this menu
  // with #360, and zoom and fit onto the bar as one control. What is left over
  // the canvas is the minimap and nothing else.
  it('leaves no floating viewport group on the canvas', () => {
    expect(existsSync(path.join(here, '../floating/ViewportControls.vue'))).toBe(false)
    expect(read('../../pages/EditorShell.vue')).not.toContain('ViewportControls')
  })
})

describe('the zoom control', () => {
  const group = read('groups/ZoomGroup.vue')

  // Four inline buttons — out, %, in, fit — was the floating group's shape, and
  // reproducing it on the bar would have cost about 120px of a bar that has
  // none to spare. One trigger opens the rest, the way Slides does it.
  it('is one entry on the bar, not the four it replaces', () => {
    const template = templateOf(group)
    expect((template.match(/<ToolbarButton\b/g) || []).length).toBe(1)
  })

  // The trigger reads out the number it shows. A screen reader announcing a bare
  // "100%" says nothing about what it controls.
  it('shows the live percentage and says what it is', () => {
    expect(group).toContain(':label="`Zoom ${zoomPercent}%`"')
    expect(templateOf(group)).toContain('{{ zoomPercent }}%')
  })

  // The steps are 10% apart and the menu offers six round stops, so typing is
  // the only route to a value like 137% (spec 1.6). It came across from the
  // floating group; losing it would be a silent regression.
  it('still takes an exact typed value', () => {
    expect(group).toContain('editorUi.setZoomPercent(draft.value)')
  })

  // ⌘0 recentres as well as rescaling, and the menu's own 100% has to agree with
  // it — two routes to "100%" that leave the canvas in different places is the
  // kind of difference nobody can explain later.
  it('matches ⌘0 on 100%, and only rescales for the rest', () => {
    expect(group).toContain('if (percent === 100) editorUi.reset100()')
    expect(group).toContain('else editorUi.setZoomPercent(percent)')
  })
})
