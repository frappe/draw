import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #563 / #556 item 9: an open table cell editor (toolbar and caret both stuck on
// screen) and a selected table both stayed on screen after clicking empty canvas
// on a unified document — the select tool never delegates surface events to the
// whiteboard layer there, so the clearSelection that closes the editor AND drops
// the table selection on a legacy whiteboard doc's own selectAt never ran.
// DiagramCanvas can't mount in the node env, so pin the wiring by source
// inspection (house pattern, cf. structuralConnector.test.js).
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './DiagramCanvas.vue'),
  'utf8',
)

describe('a table (and any open cell editor) is deselected on any other press on the unified canvas (#563, #556 item 9)', () => {
  it('clears the whiteboard selection in onSurfacePointerDown, gated on the unified doc + select tool + a plain press', () => {
    expect(src).toMatch(
      /function onSurfacePointerDown\(event\) \{[\s\S]*?if \(\s*isUnified\.value &&\s*editorUi\.state\.tool === 'select' &&\s*!isAdditiveEvent\(event\) &&\s*\(whiteboardUi\.state\.editingCell \|\| whiteboardUi\.state\.selection\.length\)\s*\) \{\s*whiteboardUi\.clearSelection\(\)/,
    )
  })

  it('runs before the armed-comment/starter and whiteboard/block routing, so every press closes it first', () => {
    const pointerDown = src.slice(src.indexOf('function onSurfacePointerDown'))
    const closeIndex = pointerDown.indexOf('whiteboardUi.clearSelection()')
    const commentIndex = pointerDown.indexOf('placeArmedComment(event)')
    const starterIndex = pointerDown.indexOf('creation.placeArmedStarter(event)')
    expect(closeIndex).toBeGreaterThan(-1)
    expect(closeIndex).toBeLessThan(commentIndex)
    expect(closeIndex).toBeLessThan(starterIndex)
  })

  it('runs after the hand tool pans, so panning does not cut an edit short', () => {
    const pointerDown = src.slice(src.indexOf('function onSurfacePointerDown'))
    const handIndex = pointerDown.indexOf("editorUi.state.tool === 'hand'")
    const closeIndex = pointerDown.indexOf('whiteboardUi.clearSelection()')
    expect(handIndex).toBeGreaterThan(-1)
    expect(handIndex).toBeLessThan(closeIndex)
  })

  it('leaves an additive (shift/ctrl/cmd) press alone, matching the legacy miss-click clear', () => {
    const pointerDown = src.slice(src.indexOf('function onSurfacePointerDown'))
    expect(pointerDown).toContain('!isAdditiveEvent(event)')
  })
})
