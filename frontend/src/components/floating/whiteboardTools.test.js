import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { WHITEBOARD_TOOLS, visibleWhiteboardTools } from './whiteboardTools.js'

const here = path.dirname(fileURLToPath(import.meta.url))

// #103: the eraser used to be gated on whiteboard ink, so a unified canvas whose
// only content was a flowchart / mind-map (no strokes, stickies or shapes[]) hid
// it — even though object-erase would happily remove those. The eraser must now
// always be on the bar.

describe('visibleWhiteboardTools', () => {
  it('offers the eraser on an empty board (#103)', () => {
    const tools = visibleWhiteboardTools().map((t) => t.tool)
    expect(tools).toContain('eraser')
  })

  it('drops the tools the surrounding bar already provides but keeps the eraser', () => {
    // Mirrors BottomPalette.vue unifiedWhiteboardExclude. 'highlighter' is no
    // longer its own tool — it merged into Draw (#242), whose tool id is 'pen'
    // and which the catalog owns, so excluding 'pen' removes both inks.
    const exclude = ['text', 'line', 'image', 'pen', 'sticky', 'table']
    const tools = visibleWhiteboardTools(exclude).map((t) => t.tool)
    expect(tools).toEqual(['eraser', 'laser'])
  })

  it('shows the whole palette when nothing is excluded', () => {
    expect(visibleWhiteboardTools()).toEqual(WHITEBOARD_TOOLS)
  })
})

// #462: the eraser's options are a MENU now — Eraser, Erase by object, Clear all —
// with the tip sizes hanging off Eraser as a side menu.
describe('the eraser menu (#462)', () => {
  const source = readFileSync(path.join(here, 'WhiteboardTools.vue'), 'utf8')

  // frappe-ui's nesting support lives on Dropdown, and a second Popover nested in
  // the shared options Popover would close the outer one on its own outside-press.
  it('opens a Dropdown of its own, not the shared options popover', () => {
    expect(source).toContain('<Dropdown v-else-if="t.tool === \'eraser\'"')
  })

  it('offers the two modes, with the sizes as a side menu off Eraser', () => {
    expect(source).toContain("{ key: 'ink', icon: 'lucide-eraser', label: 'Eraser' }")
    expect(source).toContain("{ key: 'object', icon: 'lucide-square-x', label: 'Erase by object' }")
    // Only the tip-based mode takes a size: erasing by object has no tip.
    expect(source).toContain('submenu: eraserSizeMenu.value')
  })

  // frappe-ui renders any option carrying a submenu as a SubTrigger, which opens the
  // submenu instead of firing an onClick. An onClick there is dead code that reads
  // like it arms the tool — picking a SIZE is what arms ink mode, so every size row
  // has to call armEraser itself.
  it('does not hang a dead click handler on the submenu parent', () => {
    const inkOption = source.slice(source.indexOf('mode.key === \'ink\''), source.indexOf('const eraserSizeMenu'))
    expect(inkOption).toContain('submenu: eraserSizeMenu.value')
    expect(inkOption, 'a submenu trigger never fires its own onClick').not.toContain('onClick: () => armEraser(mode.key)\n        ? ')
    const sizeMenu = source.slice(source.indexOf('const eraserSizeMenu'), source.indexOf('function armEraser'))
    expect(sizeMenu, 'picking a size must arm the mode it belongs to').toContain("armEraser('ink')")
  })

  // Named rows rather than three bare dots to compare.
  it('names the three sizes', () => {
    expect(source).toContain("const ERASER_SIZE_LABELS = ['Small', 'Medium', 'Large']")
  })

  // The dots are Lucide icons of different weights now, which is what retires the
  // hand-built swatch row this menu used to carry.
  it('leaves no hand-built swatch in the eraser menu', () => {
    const eraserBlock = source.slice(source.indexOf('const eraserMenu'), source.indexOf('function dotStyle'))
    expect(eraserBlock).not.toContain('frappe-ui-exempt')
    expect(source).not.toContain('ERASER_MODE_TABS')
  })

  // Clear all is an ACTION, not a third mode: the other two arm a tool and stay
  // armed, this one fires once. A tab would show it selected after the canvas was
  // already wiped.
  it('keeps Clear all out of the mode group, and marks it destructive', () => {
    expect(source).toContain("label: 'Clear all'")
    expect(source).toContain("theme: 'red'")
    expect(source).toMatch(/group: 'Canvas'[\s\S]{0,200}Clear all/)
  })

  it('asks before wiping the canvas, and clears it in one store call', () => {
    expect(source).toContain('confirmingClearAll.value = true')
    expect(source).toContain('store.clearCanvas()')
    expect(source).toContain('title="Clear the canvas?"')
  })

  // Picking a mode from the menu must arm the tool too, or the previous tool is
  // still live under the pointer.
  it('arms the eraser when a mode or size is picked', () => {
    expect(source).toContain("editorUi.setTool('eraser')")
  })
})
