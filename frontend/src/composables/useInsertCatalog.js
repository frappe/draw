// Everything the toolbar's insert entries place on the canvas (#364).
//
// This was the bottom palette's "+" catalog: one popover holding five labelled
// sections behind a search box. The sections are now five toolbar entries, so
// the search is gone (each menu shows at most eleven items) and design/SPEC.md
// 2.1 is amended to match. The DATA and the arming rules did not change, and
// they live here so the group components stay presentational.

import { computed } from 'vue'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { useImageInsert } from '@/composables/useImageInsert.js'
import { startPaletteDrag } from '@/composables/useShapeCreation.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { NODE_TYPES, NODE_TYPE_META } from '@/diagram/flowchartModel.js'
import { tableInsertOrigin } from '@/components/floating/tableSizePicker.js'
import { regularPolygon, POLYGON_INSERT_WIDTH } from '@/diagram/polygon.js'

// Curated set (#131). The polygon is placed vertex by vertex, so its tile arms a
// multi-click tool and — unlike every other shape — cannot be dragged onto the
// canvas, because there is no fixed geometry to drop.
//
// Square and Diamond are not tiles of their own: a square is a rectangle drawn
// with Shift held (boxBetween in useShapeCreation.js already locks the sides
// equal), and Diamond stayed reachable only through this catalog, which is
// gone. Both shape TYPES still exist in the schema/renderer — a mind-map node
// and a flowchart decision node still use them — this only trims the tile grid.
// Lucide icons, like every other tile on the bar (#425), rather than the drawn
// outlines this list used to carry — the Shapes menu was the last place in the
// editor using artwork of its own, and it read as a different family beside the
// Lines and Insert tiles next to it.
//
// One is a deliberate approximation: Lucide has no wide rectangle, so `square`
// stands for the rectangle the tile inserts, exactly as Frappe Slides does it.
// `square-round-corner` keeps it distinct from the rounded rectangle below, which
// is the pair that actually has to be told apart.
//
// Nine tiles here plus the custom polygon, which the menu renders itself (it asks
// for a side count first), make a 5 × 2 grid (#470). It was 4 × 2 at eight tiles;
// Trapezoid and Parallelogram take it to ten, and five across keeps both rows full
// rather than leaving two blanks in a third row.
//
// Lucide has neither shape, so those two carry a drawn `glyph` instead of an
// `icon` — generated from the outline they insert rather than drawn by hand.
export const SHAPES = [
  // "Quadrilateral", not "Rectangle — hold Shift for a square" (#451 item 4): the
  // Shift hint belongs in the shortcuts sheet, not in a tooltip on every hover.
  { type: 'rectangle', icon: 'lucide-square', label: 'Quadrilateral' },
  { type: 'rounded', icon: 'lucide-square-round-corner', label: 'Rounded rectangle' },
  { type: 'ellipse', icon: 'lucide-circle', label: 'Ellipse' },
  { type: 'triangle', icon: 'lucide-triangle', label: 'Triangle' },
  { type: 'hexagon', icon: 'lucide-hexagon', label: 'Hexagon' },
  // A polygon glyph, not the pen tool #431 gave it (#451 item 1). The tile draws a
  // polygon, so it should look like one — and it now sits beside the custom
  // polygon, whose glyph is the same outline marked "n".
  { type: 'polygon', icon: 'lucide-pentagon', label: 'Polygon' },
  { type: 'arrow', icon: 'lucide-arrow-big-right', label: 'Block arrow' },
  { type: 'trapezoid', glyph: 'preset', label: 'Trapezoid' },
  { type: 'parallelogram', glyph: 'preset', label: 'Parallelogram' },
]
export const NON_DRAGGABLE_SHAPES = ['polygon']

// A plain Line has no arrowheads; Arrow ends in one. The arrow connector's id is
// namespaced so it never collides with the 'arrow' block-arrow SHAPE above —
// both would otherwise key the same draw tool.
//
// Two of these moved off their Lucide icon in #457. Line carried `lucide-minus`, a
// short centred bar that reads as a subtract sign; Lucide has no straight line with
// endpoints, so it takes a drawn `glyph` instead — the one exception on this bar,
// and the reason a tile may carry `glyph` in place of `icon`. Curved carried
// `lucide-git-commit-horizontal`, whose middle dot says nothing about a connector;
// `lucide-spline` is an arc between two endpoint dots, which is what the tool draws.
export const LINES = [
  { type: 'line', glyph: 'line', label: 'Line' },
  { type: 'connector-arrow', icon: 'lucide-arrow-right', label: 'Arrow' },
  { type: 'elbow', icon: 'lucide-corner-down-right', label: 'Elbow connector' },
  { type: 'curved', icon: 'lucide-spline', label: 'Curved connector' },
]

// `surface` tools draw onto the whiteboard layer, so they only apply to the
// unified canvas; text and image are block-owned and work on any create canvas.
export const CREATE_TOOLS = [
  { key: 'text', icon: 'lucide-type', label: 'Text', surface: false },
  { key: 'sticky', icon: 'lucide-sticky-note', label: 'Sticky note', surface: true },
  { key: 'image', icon: 'lucide-image', label: 'Image', surface: false },
  { key: 'table', icon: 'lucide-table', label: 'Table', surface: true },
]

export const FLOWCHART_NODES = NODE_TYPES.map((type) => ({
  type,
  label: NODE_TYPE_META[type].label,
}))

export function useInsertCatalog() {
  const store = useDiagramStore()
  const editorUi = useEditorUi()
  const whiteboardUi = useWhiteboardUi()
  const imageInsert = useImageInsert(store)
  const viewport = editorUi.viewport

  // Detected from the document, not the strategy, which falls back to block.
  const isUnified = computed(() => isUnifiedDocument(store.state))
  const insertTools = computed(() => CREATE_TOOLS.filter((t) => !t.surface || isUnified.value))
  // A mind map / flowchart starter lays itself out on the shared canvas, so both
  // are unified-only.
  const showsStarters = computed(() => isUnified.value)

  function arm(type, close) {
    editorUi.setDrawShape(type)
    close?.()
  }
  function isArmed(type) {
    return editorUi.state.tool === 'draw' && editorUi.state.drawShapeType === type
  }

  // Three kinds of action hide behind one tile list: image opens a file picker,
  // text arms block draw-text, and the surface tools arm a whiteboard mode.
  function runCreateTool(tool, close) {
    // The picked image is uploaded, then ARMED rather than dropped (#503): the user
    // clicks where it goes, like every other insert. Escape or arming another tool
    // cancels it, the same as a starter.
    if (tool.key === 'image') imageInsert.pick((image) => editorUi.armStarter({ kind: 'image', image }))
    else if (tool.key === 'text') editorUi.setDrawShape('text')
    else editorUi.setTool(tool.key)
    close?.()
  }
  function isCreateToolActive(tool) {
    if (tool.key === 'text') return isArmed('text')
    // An armed image reads as active until the click that places it, so the tile
    // shows the same "waiting for you" state the other insert tools do.
    if (tool.key === 'image') return editorUi.state.pendingStarter?.kind === 'image'
    return editorUi.state.tool === tool.key
  }

  // Insert an n-sided polygon centred in view (#451 item 2). It inserts on submit
  // rather than arming a draw tool, like the table size picker: the side count is
  // already the whole answer, and a drag would let the user stretch the sides
  // unequal straight after asking for equal ones. The box takes the polygon's own
  // aspect for the same reason.
  function insertRegularPolygon(sides, close) {
    const { points, aspect } = regularPolygon(sides)
    const width = POLYGON_INSERT_WIDTH
    const height = width / aspect
    const center = viewport.centerPoint()
    const id = store.addShape({
      type: 'polygon',
      points,
      x: center.x - width / 2,
      y: center.y - height / 2,
      w: width,
      h: height,
    })
    if (id) {
      editorUi.setTool('select')
      store.select(id)
    }
    close?.()
  }

  // Drop the table centred in view, select it, and remember the size so the
  // keyboard-armed quick-place uses the same one (#134).
  function insertTable({ rows, cols }, close) {
    const origin = tableInsertOrigin(viewport.visibleRect(), rows, cols)
    const id = store.addTable(origin.x, origin.y, { rows, cols, color: whiteboardUi.state.penColor })
    if (id) {
      editorUi.setTool('select')
      whiteboardUi.selectTable(id)
      whiteboardUi.state.tableRows = rows
      whiteboardUi.state.tableCols = cols
    }
    close?.()
  }

  // Starters arm click-to-place (#75): the first node lands where the user
  // clicks, mirroring how a shape tile arms draw mode, rather than dropping a
  // node centred in view.
  function insertMindmap(close) {
    editorUi.armStarter({ kind: 'mindmap' })
    close?.()
  }
  function insertFlowchartNode(type, close) {
    editorUi.armStarter({ kind: 'flowchart', nodeType: type })
    close?.()
  }
  function isMindmapStarterArmed() {
    return editorUi.state.pendingStarter?.kind === 'mindmap'
  }
  function isFlowchartStarterArmed(type) {
    const starter = editorUi.state.pendingStarter
    return starter?.kind === 'flowchart' && starter.nodeType === type
  }

  function startTileDrag(event, type) {
    if (NON_DRAGGABLE_SHAPES.includes(type)) return
    startPaletteDrag(event, type, editorUi)
  }
  // Close only once the drag is over. Closing on dragstart unmounts the dragged
  // element and cancels the drag in some browsers.
  function endTileDrag(close) {
    close?.()
  }

  return {
    isUnified,
    insertTools,
    showsStarters,
    arm,
    isArmed,
    runCreateTool,
    isCreateToolActive,
    insertTable,
    insertRegularPolygon,
    insertMindmap,
    insertFlowchartNode,
    isMindmapStarterArmed,
    isFlowchartStarterArmed,
    startTileDrag,
    endTileDrag,
  }
}
