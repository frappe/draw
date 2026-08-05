import { describe, it, expect } from 'vitest'
import { WHITEBOARD_TOOLS, visibleWhiteboardTools } from './whiteboardTools.js'

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
