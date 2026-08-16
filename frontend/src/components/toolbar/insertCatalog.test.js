import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// SHAPES is read from the module rather than scraped out of its source, so the
// icon names asserted below are the ones the tiles actually render. Reaching it
// pulls frappe-ui in through useImageInsert, and frappe-ui's own source only
// resolves through its vite plugin (same stub as useThumbnail.test.js).
vi.mock('frappe-ui', () => ({
  FileUploadHandler: class {},
  createResource: () => ({ submit: () => {} }),
  call: () => Promise.resolve({}),
}))
const { SHAPES, LINES } = await import('@/composables/useInsertCatalog.js')

// The insert cluster (#364). The "+" catalog's five sections are five toolbar
// entries now, so the assertions moved off BottomPalette.vue with the controls.
//
// Pinned by source inspection: the browser-free node env cannot mount these
// (house pattern, cf. insertsInView.test.js).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')

describe('the mind-map entry (#255 / #75 / #200)', () => {
  const groups = read('./groups/InsertGroups.vue')

  // #255 named the tile "Parent Node" when it sat inside a catalog section headed
  // "Mind map". The section IS the entry now, so the entry carries the category
  // name.
  //
  // The tooltip used to spell out "Mind map — click the canvas to place the parent
  // node". A tooltip names its control; instructions belong where the tool is armed,
  // and every neighbouring entry says one word (#413). The instruction is not lost:
  // arming a starter turns the cursor into the placement crosshair, which is the
  // affordance a sentence in a tooltip was standing in for.
  it('is labelled for the category, with no instructions in the tooltip', () => {
    expect(groups).toContain('label="Mind map"')
    expect(groups).not.toContain('click the canvas to place')
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

// The Shapes tiles are Lucide icons now (#425), not drawn outlines. A Lucide class
// only paints if the icon really exists in the pack — a wrong or renamed name is a
// silently blank tile, not an error — so the names are checked against the pack
// itself rather than merely being present in the source.
describe('the Shapes tiles (#425)', () => {
  const iconsDir = path.join(here, '../../../node_modules/lucide-static/icons')

  // Every tile carries a Lucide `icon` or a drawn `glyph`, never both and never
  // neither — either mistake is a blank tile rather than an error. Trapezoid and
  // Parallelogram take the glyph route because Lucide has no such icon (#470).
  it('gives every shape a Lucide icon that exists in the pack, or a drawn glyph', () => {
    for (const shape of SHAPES) {
      expect(Boolean(shape.icon) !== Boolean(shape.glyph), `${shape.label} has no single mark`).toBe(true)
      if (!shape.icon) continue
      expect(shape.icon, `${shape.label} has no icon`).toMatch(/^lucide-[a-z0-9-]+$/)
      const name = shape.icon.replace('lucide-', '')
      expect(
        existsSync(path.join(iconsDir, `${name}.svg`)),
        `lucide-${name} (${shape.label}) is not in the icon pack — the tile renders blank`,
      ).toBe(true)
    }
  })

  // Rectangle and rounded rectangle are the pair a user actually has to tell
  // apart, and `square` vs `square-round-corner` is the whole of that signal.
  it('keeps the rectangle and the rounded rectangle visually distinct', () => {
    const icons = Object.fromEntries(SHAPES.map((s) => [s.type, s.icon]))
    expect(icons.rectangle).not.toBe(icons.rounded)
    expect(icons.rounded).toContain('round')
  })

  it('renders them icon-only, with the label left as the accessible name', () => {
    const groups = read('./groups/InsertGroups.vue')
    const from = groups.indexOf('v-for="shape in SHAPES"')
    // The tile is self-closing now, so bound the slice on the end of the Shapes
    // popover rather than on a closing tag it no longer has.
    const tile = groups.slice(from, groups.indexOf('</Popover>', from))
    expect(tile).toContain(':icon="shape.icon"')
    expect(tile).toContain(':label="shape.label"')
    // A #icon slot is fine — the custom polygon tile draws its glyph that way
    // (#451). A DEFAULT slot is what would put words in an icon-only grid.
    expect(tile, 'slot content would put a text label in the icon-only grid').not.toContain('<template #default')
    expect(tile, 'an unnamed slot is the default slot').not.toContain('<template>')
  })

  // ShapeGlyph now covers only what Lucide cannot: the flowchart node geometry and
  // the mind-map mark. A block branch left behind would be dead code that still
  // looks like the source of the shape tiles.
  it('leaves no block-shape branch behind in ShapeGlyph', () => {
    const glyph = read('../floating/ShapeGlyph.vue')
    expect(glyph).not.toContain("family === 'block'")
    expect(glyph).toContain("family === 'flowchart'")
    expect(glyph).toContain("family === 'mindmap'")
  })
})

// #451: the Shapes menu is eight tiles in a 4 x 2 grid, and the eighth asks for a
// side count before it inserts anything.
describe('the shapes grid (#451)', () => {
  const groups = read('./groups/InsertGroups.vue')

  // #470 took it from eight tiles to ten. Five across keeps both rows full; four
  // would have left a third row half empty, which is what the 4 x 2 grid existed
  // to avoid.
  it('lays the menu out five across, so ten tiles fill two full rows', () => {
    expect(groups).toContain('grid-cols-5')
    expect(SHAPES).toHaveLength(9) // + the custom polygon the menu renders itself
    expect((SHAPES.length + 1) % 5, 'the last row would have a gap in it').toBe(0)
  })

  // The Lines menu and the flowchart node grid still hold four each, so they keep
  // the narrower grid — the two must not be collapsed into one constant.
  it('leaves the four-across grid for the menus that hold four', () => {
    expect(groups).toContain('grid-cols-4')
    expect(groups).toContain(':class="shapesGrid"')
  })

  it('gives the polygon tile a polygon glyph, not the pen tool', () => {
    const polygon = SHAPES.find((shape) => shape.type === 'polygon')
    expect(polygon.icon).toBe('lucide-pentagon')
    expect(polygon.icon).not.toBe('lucide-pen-tool')
  })

  it('names the rectangle tile Quadrilateral, with no description hanging off it', () => {
    const rectangle = SHAPES.find((shape) => shape.type === 'rectangle')
    expect(rectangle.label).toBe('Quadrilateral')
    expect(groups).not.toContain('hold Shift for a square')
  })

  it('offers the custom polygon behind a side-count prompt', () => {
    expect(groups).toContain('label="Custom polygon"')
    expect(groups).toContain('PolygonSidesPicker')
    // It inserts on submit rather than arming a draw tool, so it must not be
    // draggable — there is no shape to drop until the count is known.
    const tile = groups.slice(groups.indexOf('label="Custom polygon"'))
    expect(tile.slice(0, tile.indexOf('/>'))).not.toContain('draggable')
  })
})

// #456: a drawn glyph beside a Lucide icon has to be drawn to Lucide's spec, or it
// reads as a second icon set. Two variables produced the same 50% overweight mark,
// so both are pinned.
describe('drawn glyphs weigh the same as the Lucide icons beside them (#456)', () => {
  const glyph = read('../floating/ShapeGlyph.vue')

  // frappe-ui rewrites every Lucide icon to 1.5 via normalizeStrokeWidth in
  // tailwind/lucideIconsPlugin.js. Lucide's own stock 2 is the wrong number here.
  it('strokes at 1.5, the width frappe-ui normalises Lucide to', () => {
    expect(glyph).toContain('stroke-width="1.5"')
    expect(glyph).not.toContain('stroke-width="2"')
  })

  // frappe-ui draws a size="sm" Button icon at size-4. An #icon slot is passed
  // through unsized, so each call site has to ask for it — and every one of them
  // used to override it to 18px, which scaled the mark up as well as the stroke.
  it('renders every call site at size-4, never at a hand-picked pixel size', () => {
    const callSites = [
      './groups/InsertGroups.vue',
      './groups/FlowchartNodeTypeGroup.vue',
      '../canvas/FlowchartNodeTypePicker.vue',
    ]
    for (const file of callSites) {
      const source = read(file)
      const sized = [...source.matchAll(/<ShapeGlyph[^>]*class="([^"]*)"/g)]
      // Count first: a glyph carrying no class at all would match nothing above
      // and pass the loop silently, while rendering at whatever it inherits.
      const total = (source.match(/<ShapeGlyph\b/g) || []).length
      expect(sized, `${file} has a glyph with no class`).toHaveLength(total)
      for (const [, cls] of sized) {
        expect(cls, `${file} sizes a glyph by hand`).not.toMatch(/\[\d+px\]/)
        expect(cls, `${file} does not render its glyph at size-4`).toMatch(/\bsize-4\b/)
      }
    }
  })

  // FIT is what makes the drawing fill the same 18 of 24 units as lucide-square
  // (x=3 y=3 w=18 h=18). Shrinking the box without it would undersize the mark.
  it('fills the same 18 of 24 units a Lucide icon does', () => {
    expect(glyph).toContain('const FIT = 18')
  })
})

// #457 / #458 / #459: three toolbar icons that either said the wrong thing or were
// indistinguishable from the control at the other end of the same bar.
describe('toolbar icons say what their control does', () => {
  const groups = read('./groups/InsertGroups.vue')
  const iconsDir = path.join(here, '../../../node_modules/lucide-static/icons')
  const inPack = (icon) => existsSync(path.join(iconsDir, `${icon.replace('lucide-', '')}.svg`))

  // A tile carries an `icon` from the pack or a drawn `glyph`, never both and
  // never neither — either mistake renders a blank tile rather than an error.
  it('gives every Lines tile exactly one mark, and a real one', () => {
    for (const line of LINES) {
      expect(Boolean(line.icon) !== Boolean(line.glyph), `${line.label} has no single mark`).toBe(true)
      if (line.icon) expect(inPack(line.icon), `${line.icon} is not in the pack`).toBe(true)
    }
  })

  it('draws Line as a line, not as a minus sign', () => {
    const line = LINES.find((entry) => entry.type === 'line')
    expect(line.glyph).toBe('line')
    expect(line.icon).toBeUndefined()
    // The bar's trigger and the tile it opens have to wear the same mark.
    expect(groups).toContain('<ShapeGlyph family="line" class="size-4" />')
    expect(groups).toContain(':family="connector.glyph"')
  })

  // spline is an arc between two endpoint dots, which is the tool. The dots are
  // also the drawn Line glyph's, so straight and curved read as a pair.
  it('gives the curved connector the arc-with-endpoints icon', () => {
    const curved = LINES.find((entry) => entry.type === 'curved')
    expect(curved.icon).toBe('lucide-spline')
    expect(curved.icon).not.toBe('lucide-git-commit-horizontal')
  })

  // Both were a rounded square with interior rules, and they sit at opposite ends
  // of the same bar.
  it('keeps Guides distinct from Table, on an icon that means dotted grid', () => {
    const guides = read('./groups/GuidesGroup.vue')
    expect(guides).toContain('icon-left="lucide-grip"')
    // Bound to the attribute, not the bare name: the comment above the control
    // names the icon it replaced, and that is worth keeping.
    expect(guides).not.toContain('icon-left="lucide-grid-2x2"')
    expect(inPack('lucide-grip')).toBe(true)
    // The icon it used to collide with is unchanged, so the pair is really apart.
    expect(read('../../composables/useInsertCatalog.js')).toContain("icon: 'lucide-table'")
  })

  // git-branch still means "branch" on FlowchartNodeGroup's Branches control, so
  // the Flowchart menu had to move off it rather than the other way round.
  it('gives the Flowchart menu a flowchart icon, not the Branches one', () => {
    expect(groups).toContain('label="Flowchart" icon="lucide-network"')
    expect(inPack('lucide-network')).toBe(true)
    expect(groups).not.toContain('icon="lucide-git-branch"')
    expect(read('./groups/FlowchartNodeGroup.vue')).toContain('label="Branches" icon="lucide-git-branch"')
  })
})

// #470: Lucide has no trapezoid and no parallelogram, so these two tiles draw their
// own mark. It is generated from the outline they insert rather than drawn by hand,
// which is the only thing that keeps a tile honest about what it places.
describe('the shapes Lucide cannot stand in for (#470)', () => {
  const groups = read('./groups/InsertGroups.vue')
  const glyph = read('../floating/ShapeGlyph.vue')

  it('gives both new tiles a drawn glyph rather than a missing icon', () => {
    for (const type of ['trapezoid', 'parallelogram']) {
      const tile = SHAPES.find((shape) => shape.type === type)
      expect(tile, `${type} has no tile`).toBeTruthy()
      expect(tile.glyph).toBe('preset')
      expect(tile.icon).toBeUndefined()
    }
  })

  it('renders the tile glyph from the shape geometry, not a hand-drawn likeness', () => {
    expect(glyph).toContain('presetPolygonPoints(')
    expect(groups).toContain(':family="shape.glyph"')
    expect(groups).toContain(':type="shape.type"')
  })

  // Both are drawn into the same 18-of-24 box a Lucide icon fills, so they sit at
  // the weight and size of the tiles beside them (#456).
  it('fits the preset glyph to the Lucide box', () => {
    expect(glyph).toContain('x: (BOX - FIT) / 2')
    expect(glyph).toContain('w: FIT, h: FIT')
  })
})
