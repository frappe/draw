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

// Curated set (#131). The polygon is placed vertex by vertex, so its tile arms a
// multi-click tool and — unlike every other shape — cannot be dragged onto the
// canvas, because there is no fixed geometry to drop.
export const SHAPES = [
  { type: 'rectangle', label: 'Rectangle' },
  { type: 'square', label: 'Square' },
  { type: 'rounded', label: 'Rounded rectangle' },
  { type: 'ellipse', label: 'Ellipse' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'diamond', label: 'Diamond' },
  { type: 'hexagon', label: 'Hexagon' },
  { type: 'polygon', label: 'Polygon' },
  { type: 'arrow', label: 'Block arrow' },
]
export const NON_DRAGGABLE_SHAPES = ['polygon']

// A plain Line has no arrowheads; Arrow ends in one. The arrow connector's id is
// namespaced so it never collides with the 'arrow' block-arrow SHAPE above —
// both would otherwise key the same draw tool.
export const LINES = [
  { type: 'line', icon: 'lucide-minus', label: 'Line' },
  { type: 'connector-arrow', icon: 'lucide-arrow-right', label: 'Arrow' },
  { type: 'elbow', icon: 'lucide-corner-down-right', label: 'Elbow connector' },
  { type: 'curved', icon: 'lucide-git-commit-horizontal', label: 'Curved connector' },
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
    if (tool.key === 'image') imageInsert.pick(() => viewport.centerPoint())
    else if (tool.key === 'text') editorUi.setDrawShape('text')
    else editorUi.setTool(tool.key)
    close?.()
  }
  function isCreateToolActive(tool) {
    if (tool.key === 'text') return isArmed('text')
    if (tool.key === 'image') return false
    return editorUi.state.tool === tool.key
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
    insertMindmap,
    insertFlowchartNode,
    isMindmapStarterArmed,
    isFlowchartStarterArmed,
    startTileDrag,
    endTileDrag,
  }
}
