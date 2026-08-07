import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #261: a hover outline appears on the shape under the cursor in select mode, for
// every element, and must NOT show for the selected shape or under a non-select
// tool. It paints last in the viewport group so opaque shapes can't occlude it on
// the unified canvas. Pinned by source inspection (can't mount in the node env).
const read = (rel) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), rel), 'utf8')
const hover = read('./HoverOutline.vue')
const canvas = read('./DiagramCanvas.vue')

describe('hover outline (#261)', () => {
  it('only outlines an unselected shape while the select tool is active', () => {
    expect(hover).toContain(
      'if (!id || !selectTool.value || store.state.selection.includes(id)) return null',
    )
  })

  it('tracks the topmost interactable shape actually under the pointer', () => {
    expect(hover).toContain('isInteractable(shape)')
    expect(hover).toContain('pointInShape(point, shape)')
  })

  it('is painted last in the viewport group so opaque shapes cannot occlude it', () => {
    const editor = canvas.indexOf('<TextEditor v-if="showBlockLayer" />')
    const outline = canvas.indexOf('<HoverOutline v-if="showBlockLayer" />')
    expect(editor).toBeGreaterThan(-1)
    expect(outline).toBeGreaterThan(editor)
  })
})
