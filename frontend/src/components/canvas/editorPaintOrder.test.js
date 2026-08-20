import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #258: the inline <TextEditor> overlay must paint AFTER every shape layer, or an
// opaque shape fill (e.g. a mind-map node, whose fill is always opaque) occludes
// the live caret + typed text until blur. On the unified canvas the shapes are
// painted by <WhiteboardLayer>, a LATER sibling than the editor's old position, so
// the editor was being covered. SVG paints in document order and the browser-free
// node env can't paint, so the ordering invariant is pinned by source inspection
// (house pattern, cf. insertsInView.test.js).
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './DiagramCanvas.vue'),
  'utf8',
)

describe('inline text editor paints above the shape layers (#258)', () => {
  it('renders no <TextEditor> before <WhiteboardLayer>', () => {
    const whiteboard = src.indexOf('<WhiteboardLayer')
    expect(whiteboard).toBeGreaterThan(-1)
    // The first (and every) editor overlay must come AFTER the whiteboard shape
    // layer; an editor painted before it would sit under opaque shape fills.
    expect(src.indexOf('<TextEditor')).toBeGreaterThan(whiteboard)
  })

  it('mounts the shared editor last, gated to the block substrate', () => {
    // The shared overlay (unified + legacy block) sits at the end of the viewport
    // group, guarded so it never double-mounts with the legacy-whiteboard copy.
    expect(src).toContain('<TextEditor v-if="showBlockLayer" />')
  })
})

// The selection outline + resize/rotate handles have the same paint-order need as
// the text editor above, and the same reason (#258-class bug, filed as its own
// issue): a selected shape sitting under an opaque whiteboard object — a sticky, an
// image, another shape — on the unified canvas must not have its selection box
// hidden underneath it.
describe('selection layer paints above the whiteboard layer', () => {
  it('renders <SelectionLayer> only after <WhiteboardLayer>, and only once', () => {
    const whiteboard = src.indexOf('<WhiteboardLayer')
    expect(whiteboard).toBeGreaterThan(-1)
    const first = src.indexOf('<SelectionLayer')
    expect(first).toBeGreaterThan(whiteboard)
    // Exactly one mount — no earlier block-layer copy, no legacy-whiteboard copy.
    expect(src.indexOf('<SelectionLayer', first + 1)).toBe(-1)
  })

  it('mounts for both the block substrate and a legacy whiteboard', () => {
    expect(src).toContain('<SelectionLayer v-if="showBlockLayer || isWhiteboard" />')
  })
})
