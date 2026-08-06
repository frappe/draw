import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #255 (+ guard for #75/#200): the mind-map entry in the (+) insert catalog is the
// "Parent Node" tile. It must (a) be labelled "Parent Node", (b) stay findable by
// searching either "parent" or "mind", and (c) ARM click-to-place rather than
// dropping the node directly — the #200 behaviour a stale build regresses to. The
// glyph is a single node + three curved connectors (no end dots). Pinned by source
// inspection: the browser-free node env can't mount the floating palette (house
// pattern, cf. insertsInView.test.js).
const readSrc = (rel) =>
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), rel), 'utf8')

describe('the Parent Node catalog tile (#255)', () => {
  const src = readSrc('./BottomPalette.vue')

  it('labels the mind-map tile "Parent Node"', () => {
    // The tile is a frappe-ui <Button> (#289), so the label rides its `tooltip`
    // (hover text) and `label` (accessible name) props rather than a <Tooltip>.
    expect(src).toContain('tooltip="Parent Node"')
    expect(src).toContain('label="Parent Node"')
  })

  it('stays findable under both "parent" and "mind" catalog searches', () => {
    expect(src).toContain("'parent node mind map'.includes(query.value)")
  })

  it('arms click-to-place instead of dropping the node directly (#75/#200)', () => {
    // insertMindmap must arm a starter (crosshair → drop on click), NOT call
    // insertMindmapStarter(viewport.visibleRect()) which drops it centred at once.
    const start = src.indexOf('function insertMindmap(')
    const body = src.slice(start, src.indexOf('function insertFlowchartNode', start))
    expect(body).toContain("editorUi.armStarter({ kind: 'mindmap' })")
    expect(body).not.toContain('insertMindmapStarter')
  })
})

describe('the Parent Node glyph (#255)', () => {
  const src = readSrc('./ShapeGlyph.vue')

  it('draws one parent node with three branching connectors and no end dots', () => {
    const block = src.slice(src.indexOf("family === 'mindmap'"))
    const mindmap = block.slice(0, block.indexOf('</template>'))
    expect((mindmap.match(/<path /g) || []).length).toBe(3)
    expect((mindmap.match(/<rect /g) || []).length).toBe(1)
    expect(mindmap).not.toContain('<circle')
  })
})
