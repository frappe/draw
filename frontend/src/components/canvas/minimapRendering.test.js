import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #236/#237: the minimap drew an approximation — one glyph per shape or node, and
// every whiteboard object as a plain grey box — so a board of handwriting read as a
// scatter of rectangles. It renders the real document now, through the same builder
// the thumbnails and exports use. Browser-free source checks, like the toolbar SFCs.
const here = path.dirname(fileURLToPath(import.meta.url))
const minimap = readFileSync(path.join(here, 'Minimap.vue'), 'utf8')

describe('the minimap draws the diagram, not an approximation (#236, #237)', () => {
  it('renders through documentToSvg, the builder the exports use', () => {
    expect(minimap).toContain('documentToSvg(store.getDocument()')
  })

  it('anchors the picture the way the navigator maps it', () => {
    // useMinimapNavigator maps the frame's top-left to 0,0 at a uniform scale.
    // documentToSvg defaults to xMidYMid, which centres the drawing and would leave
    // the viewport rectangle sitting off it.
    expect(minimap).toContain("fit: 'xMinYMin meet'")
  })

  it('takes its bounds from the very markup it drew', () => {
    // The old code computed content bounds separately from the picture, so the two
    // could disagree about where anything was.
    expect(minimap).toContain('readViewBox(rendered.value)')
    expect(minimap).toContain('viewBox="[^"]*"')
  })

  it('drops the per-type glyph builders it no longer needs', () => {
    for (const gone of [
      'blockItems',
      'flowchartItems',
      'mindmapItems',
      'flowchartLinks',
      'mindmapLinks',
      'connectorLinks',
      'miniKind',
      'miniMindShape',
      'whiteboardObjectBoxes',
    ]) {
      expect(minimap, `${gone} should be gone`).not.toContain(gone)
    }
  })

  it('keeps the viewport rectangle and the pan gestures', () => {
    expect(minimap).toContain('clampedViewRect')
    for (const handler of ['onDown', 'onMove', 'onUp']) {
      expect(minimap).toContain(handler)
    }
  })

  it('keeps its empty state, and does not draw a frame around nothing', () => {
    expect(minimap).toContain('Nothing to preview yet')
    expect(minimap).toContain('v-if="hasContent"')
  })

  it('leaves the whiteboard to its own navigator', () => {
    expect(minimap).toContain("type.value !== 'whiteboard'")
  })

  it('rejects a viewBox it cannot use rather than dividing by zero', () => {
    // A degenerate box would make the navigator's scale Infinity.
    expect(minimap).toContain('if (width <= 0 || height <= 0) return null')
  })

  it('is collapsible and hides when document is empty (#568)', () => {
    expect(minimap).toContain('const isEmpty = computed(() => isDocumentEmpty(store.getDocument()))')
    expect(minimap).toContain("const shown = computed(() => type.value !== 'whiteboard' && !isEmpty.value)")
    expect(minimap).toContain('collapsed = ref(false)')
    expect(minimap).toContain('v-if="shown"')
    expect(minimap).toContain('v-if="collapsed"')
    expect(minimap).toContain('@click="collapsed = false"')
    expect(minimap).toContain('@click="collapsed = true"')
    expect(minimap).toContain('Collapse minimap')
    expect(minimap).toContain('Show minimap')
  })
})
