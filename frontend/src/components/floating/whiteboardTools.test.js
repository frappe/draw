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

// #462: the eraser's options read as a menu — Eraser, Erase by object, Clear all —
// with the tip sizes behind the first entry.
describe('the eraser menu (#462)', () => {
  const source = readFileSync(path.join(here, 'WhiteboardTools.vue'), 'utf8')

  // It stays a Popover like every other option tool. frappe-ui's Dropdown is reka's
  // MODAL menu and does not expose the `modal` prop, so while it was open nothing
  // else on screen responded — not the canvas, not another tool, not even the
  // eraser's own button. Both the one-click tool swap and "arm and use" died with it.
  it('stays a Popover, so it cannot trap the toolbar behind it', () => {
    expect(source).not.toContain('<Dropdown')
    expect(source).not.toContain("Dropdown,")
    expect(source).toContain("t.tool === 'eraser'")
  })

  it('offers the two modes and the sizes behind the first', () => {
    expect(source).toContain("{ key: 'ink', icon: 'lucide-eraser', label: 'Eraser' }")
    expect(source).toContain("{ key: 'object', icon: 'lucide-square-x', label: 'Erase by object' }")
    // Only the tip-based mode takes a size: erasing by object has no tip.
    expect(source).toContain('eraserSizesOpen = true')
  })

  // Swapped in place rather than nested: a second Popover inside this one would
  // close the outer on its own outside-press, the trap the Shapes menu already hit.
  it('swaps the sizes in place instead of nesting a second popover', () => {
    expect(source).toContain('const eraserSizesOpen = ref(false)')
    const panel = source.slice(source.indexOf("t.tool === 'eraser'"), source.indexOf('Sticky: color'))
    expect(panel).toContain('v-if="!eraserSizesOpen"')
    expect(panel).toContain('v-else')
    expect((panel.match(/<Popover/g) || []).length).toBe(0)
  })

  it('names the three sizes', () => {
    expect(source).toContain("const ERASER_SIZE_LABELS = ['Small', 'Medium', 'Large']")
  })

  // The dots are Lucide icons of different weights now, which retires the hand-built
  // swatch row this menu used to carry.
  it('leaves no hand-built swatch in the eraser panel', () => {
    const panel = source.slice(source.indexOf("t.tool === 'eraser'"), source.indexOf('Sticky: color'))
    expect(panel).not.toContain('frappe-ui-exempt')
    expect(panel).not.toContain('<button')
    expect(source).not.toContain('ERASER_MODE_TABS')
  })

  // Clear all is an ACTION, not a third mode: the other two arm a tool and stay
  // armed, this one fires once. It is separated from them and red.
  it('keeps Clear all apart from the modes, and marks it destructive', () => {
    const panel = source.slice(source.indexOf("t.tool === 'eraser'"), source.indexOf('Sticky: color'))
    expect(panel).toContain('label="Clear all"')
    expect(panel).toMatch(/border-t[\s\S]{0,400}label="Clear all"/)
    expect(panel).toMatch(/theme="red"[\s\S]{0,200}label="Clear all"/)
  })

  it('asks before wiping the canvas, and clears it in one store call', () => {
    expect(source).toContain('confirmingClearAll = true')
    expect(source).toContain('store.clearCanvas()')
    expect(source).toContain('title="Clear the canvas?"')
  })

  // Picking a mode or a size must arm the tool too, or the previously selected tool
  // is still live under the pointer. Picking a size is what arms ink mode.
  it('arms the eraser when a mode or size is picked', () => {
    expect(source).toContain("editorUi.setTool('eraser')")
    expect(source).toContain("armEraser('ink')")
    expect(source).toContain("armEraser('object')")
  })
})
