import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #427 item 4: dragging a mind-map node re-parents or re-orders it. The decisions
// live in the pure mindmapDrop module (unit-tested there); what needs pinning here
// is the wiring, which cannot be mounted in the node environment.
const read = (rel) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), rel), 'utf8')
const layer = read('./MindmapDragLayer.vue')
const handles = read('./MindmapHoverHandles.vue')
const canvas = read('./DiagramCanvas.vue')
const selection = read('../../composables/useSelection.js')

describe('mind-map drag layer (#427)', () => {
  it('is non-interactive, so the gesture keeps seeing every pointer event', () => {
    expect(layer).toContain('style="pointer-events: none"')
  })

  it('is mounted with the other mind-map overlays on the canvas', () => {
    const handlesAt = canvas.indexOf('<MindmapHoverHandles />')
    const layerAt = canvas.indexOf('<MindmapDragLayer />')
    expect(handlesAt).toBeGreaterThan(-1)
    expect(layerAt).toBeGreaterThan(handlesAt)
  })

  it('hides the "+" column while a drag is in flight', () => {
    expect(handles).toContain('if (drag.state.active) return []')
  })

  it('starts from the one existing mind-map branch in the selection path', () => {
    expect(selection).toContain(
      "else useMindmapNodeDrag().start({ toLogical, start, nodeId: shape.id })",
    )
  })
})
