import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The insert cluster (#364). The "+" catalog's five sections are five toolbar
// entries now, so the assertions moved off BottomPalette.vue with the controls.
//
// Pinned by source inspection: the browser-free node env cannot mount these
// (house pattern, cf. insertsInView.test.js).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')

describe('the mind-map entry (#255 / #75 / #200)', () => {
  const groups = read('./groups/InsertGroups.vue')

  // #255 named the tile "Parent Node" when it sat inside a catalog section
  // headed "Mind map". The section IS the entry now, so the entry takes the
  // category name and the parent-node wording moves into the tooltip — both
  // words stay reachable, which is what #255 was protecting.
  it('is labelled for the category and still names the parent node', () => {
    expect(groups).toContain('label="Mind map"')
    expect(groups).toContain('tooltip="Mind map — click the canvas to place the parent node"')
  })

  // The #200 behaviour a stale build regresses to: dropping the node centred in
  // view instead of arming the crosshair and letting the click choose the spot.
  it('arms click-to-place rather than dropping the node directly', () => {
    const catalog = read('../../composables/useInsertCatalog.js')
    const start = catalog.indexOf('function insertMindmap(')
    const body = catalog.slice(start, catalog.indexOf('function insertFlowchartNode', start))
    expect(body).toContain("editorUi.armStarter({ kind: 'mindmap' })")
    expect(body).not.toContain('insertMindmapStarter')
  })
})

describe('the Shapes entry icon', () => {
  const groups = read('./groups/InsertGroups.vue')

  // A lone square is the rectangle TILE's own glyph, so the category trigger
  // read as "insert a rectangle" rather than "open the shapes". lucide-shapes
  // draws a triangle, a square and a circle together.
  //
  // Spelled out in full: Tailwind's JIT only emits the classes it can read in
  // the source, so a composed `lucide-${name}` produces no CSS and the button
  // renders blank.
  it('draws the category, not one shape from it', () => {
    expect(groups).toContain('label="Shapes" icon="lucide-shapes"')
    expect(groups).not.toContain('icon="lucide-square"')
  })
})

describe('the four placeable items are entries, not a dropdown', () => {
  const groups = read('./groups/InsertGroups.vue')

  // #364 put Text, Sticky note, Image and Table behind an "Insert" dropdown that
  // held nothing else. Two clicks to reach the four things people place most
  // often, for a lid on a box with four items in it.
  it('has no "Insert" dropdown left to open', () => {
    expect(groups).not.toContain('label="Insert"')
    expect(groups).not.toContain('lucide-plus')
  })

  it('renders one entry per create tool, straight onto the bar', () => {
    expect(groups).toContain('v-for="tool in insertTools"')
    expect(groups).toContain('@click="runCreateTool(tool)"')
  })

  // Table is the one that still needs a menu: its picker chooses the size, and
  // it inserts on pick.
  it('keeps the table size picker on the Table entry', () => {
    expect(groups).toContain('<TableSizePicker @pick="insertTable($event, toggle)" />')
  })
})

describe('drag-to-place survives the move (#364)', () => {
  const groups = read('./groups/InsertGroups.vue')
  const catalog = read('../../composables/useInsertCatalog.js')

  // Closing the menu on dragstart unmounts the dragged element and cancels the
  // drag in some browsers, so it has to close on dragend.
  it('closes the menu on dragend, not dragstart', () => {
    expect(groups).toContain('@dragstart="startTileDrag($event, shape.type)"')
    expect(groups).toContain('@dragend="endTileDrag(toggle)"')
  })

  // The polygon is placed vertex by vertex, so it has no fixed geometry to drop.
  it('keeps the polygon undraggable', () => {
    expect(catalog).toContain("export const NON_DRAGGABLE_SHAPES = ['polygon']")
    expect(groups).toContain(':draggable="!NON_DRAGGABLE_SHAPES.includes(shape.type)"')
  })
})

describe('the Parent Node glyph (#255)', () => {
  const src = read('../floating/ShapeGlyph.vue')

  it('draws one parent node with three branching connectors and no end dots', () => {
    const block = src.slice(src.indexOf("family === 'mindmap'"))
    const mindmap = block.slice(0, block.indexOf('</template>'))
    expect((mindmap.match(/<path /g) || []).length).toBe(3)
    expect((mindmap.match(/<rect /g) || []).length).toBe(1)
    expect(mindmap).not.toContain('<circle')
  })
})
