<script setup>
// Floating bottom-center palette. On the create canvas (block / unified) the big
// circular "+" is the centrepiece: it opens ONE catalog of everything you can add
// — shapes, lines, pen, text, sticky, image, table, a mind map, and every
// flowchart shape — clubbed into labelled sections (#90). The live annotation
// tools that you toggle between while sketching (highlighter / eraser / laser) and
// the guides control stay on the bar so switching them never needs a menu. Legacy
// single-type docs keep their own map/tool actions. Wired to editorUi + viewport.
import { computed, ref } from 'vue'
import { Button, Popover, TextInput } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { useImageInsert } from '@/composables/useImageInsert.js'
import { useWhiteboardUi } from '@/composables/useWhiteboardUi.js'
import { startPaletteDrag } from '@/composables/useShapeCreation.js'
import { tableInsertOrigin } from './tableSizePicker.js'
import TableSizePicker from './TableSizePicker.vue'
import { collapseAll } from '@/diagram/mindmapOperations.js'
import { autoNumberFlow, isFlowNumbered } from '@/diagram/flowchartModel.js'
import { NODE_TYPES, NODE_TYPE_META } from '@/diagram/flowchartModel.js'
import { tidyLayout, toggleDirection } from '@/diagram/flowchartLayout.js'
import WhiteboardTools from './WhiteboardTools.vue'
import ShapeGlyph from './ShapeGlyph.vue'

const editorUi = useEditorUi()
const viewport = editorUi.viewport
const modeStrategy = useModeStrategy()
const store = useDiagramStore()
const ui = useWhiteboardUi()
const imageInsert = useImageInsert(store)

const isBlock = computed(() => modeStrategy?.value?.type === 'block')
const isWhiteboard = computed(() => modeStrategy?.value?.type === 'whiteboard')
const isMindmap = computed(() => modeStrategy?.value?.type === 'mindmap')
const isFlowchart = computed(() => modeStrategy?.value?.type === 'flowchart')

// The unified canvas exposes the full creation catalog (block + whiteboard). It's
// detected from the doc, not the strategy (which falls back to block).
const isUnified = computed(() => isUnifiedDocument(store.state))
// The "create canvas" = block or unified: the layout with the centred "+" catalog.
const isCreateCanvas = computed(() => isBlock.value || isUnified.value)

// Map-wide flowchart actions (per-node editing lives in the floating toolbar).
const flowDirection = computed(() => store.state.flowchart?.direction || 'TB')
const flowNumbered = computed(() => (store.state.flowchart ? isFlowNumbered(store.state.flowchart) : false))
function flowTidy() {
  editorUi.pulseLayoutAnimation()
  store.updateFlowchartModel('Tidy up', (m) => tidyLayout(m))
}
function flowFlip() {
  editorUi.pulseLayoutAnimation()
  store.updateFlowchartModel('Flow direction', (m) => toggleDirection(m))
}
function flowNumber() {
  store.updateFlowchartModel('Number steps', (m) => autoNumberFlow(m))
}

// Curated set (#131): rectangle, square, rounded rectangle, ellipse, triangle,
// diamond, hexagon, block arrow. Dropped cylinder / callout / star / pentagon.
// Polygon (#139) is the freely-drawn N-sided shape — armed by click, then vertices
// are placed on the canvas, so unlike the rest it can't be dragged onto the canvas.
// Icons are drawn by ShapeGlyph so each tile is the actual shape it inserts.
const SHAPES = [
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
// The polygon is placed vertex-by-vertex, so its tile arms the multi-click tool
// rather than dropping a fixed shape — it is the one shape tile that can't be dragged.
const NON_DRAGGABLE_SHAPES = ['polygon']
// A plain Line has no arrowheads; Arrow ends in an arrow; elbow/curved too. The
// arrow connector's id is namespaced so it never collides with the 'arrow'
// block-arrow SHAPE above (they'd both key `byType` and the draw tool).
const LINES = [
  { type: 'line', icon: 'lucide-minus', label: 'Line' },
  { type: 'connector-arrow', icon: 'lucide-arrow-right', label: 'Arrow' },
  { type: 'elbow', icon: 'lucide-corner-down-right', label: 'Elbow connector' },
  { type: 'curved', icon: 'lucide-git-commit-horizontal', label: 'Curved connector' },
]
// Everything else you place once, folded into the catalog (#90). `surface` tools
// (pen / sticky / table) draw onto the whiteboard layer, so they only apply to the
// unified canvas; text + image are block-owned and work on any create canvas.
// 'pen' is the merged Draw tool (pen + highlighter, #242); its key stays 'pen'
// (see whiteboardTools.js) even though the label reads "Draw".
const CREATE_TOOLS = [
  { key: 'pen', icon: 'lucide-pen-line', label: 'Draw', surface: true },
  { key: 'text', icon: 'lucide-type', label: 'Text', surface: false },
  { key: 'sticky', icon: 'lucide-sticky-note', label: 'Sticky note', surface: true },
  { key: 'image', icon: 'lucide-image', label: 'Image', surface: false },
  { key: 'table', icon: 'lucide-table', label: 'Table', surface: true },
]
// Every flowchart node type (#86): the catalog can seed a chart with any shape,
// not just the Start terminator. ShapeGlyph draws each tile as the real node shape.
const FLOWCHART_NODES = NODE_TYPES.map((type) => ({
  type,
  label: NODE_TYPE_META[type].label,
}))

// Filter the catalog by a search query (spec 2.1). Empty query shows all.
const shapeQuery = ref('')
const query = computed(() => shapeQuery.value.trim().toLowerCase())
function matches(list) {
  return query.value ? list.filter((item) => item.label.toLowerCase().includes(query.value)) : list
}
const filteredShapes = computed(() => matches(SHAPES))
const filteredLines = computed(() => matches(LINES))
const filteredTools = computed(() => matches(CREATE_TOOLS.filter((t) => !t.surface || isUnified.value)))
// Mind map + flowchart frames are unified-only (they lay themselves out inside a
// frame on the shared canvas).
const filteredFlowchartNodes = computed(() => (isUnified.value ? matches(FLOWCHART_NODES) : []))
// The tile is labelled "Parent Node" (#255) but stays findable under "mind map" too.
const showMindmap = computed(() => isUnified.value && (!query.value || 'parent node mind map'.includes(query.value)))
const hasNoMatches = computed(
  () =>
    !filteredShapes.value.length &&
    !filteredLines.value.length &&
    !filteredTools.value.length &&
    !filteredFlowchartNodes.value.length &&
    !showMindmap.value,
)

function arm(type, close) {
  editorUi.setDrawShape(type)
  shapeQuery.value = ''
  close?.()
}
function isArmed(type) {
  return editorUi.state.tool === 'draw' && editorUi.state.drawShapeType === type
}

// The catalog tools resolve to three kinds of action: image opens a file picker,
// text arms block draw-text, and the surface tools arm a whiteboard mode.
function runCreateTool(tool, close) {
  if (tool.key === 'image') imageInsert.pick(() => viewport.centerPoint())
  else if (tool.key === 'text') editorUi.setDrawShape('text')
  else editorUi.setTool(tool.key)
  shapeQuery.value = ''
  close?.()
}
function isCreateToolActive(tool) {
  if (tool.key === 'text') return isArmed('text')
  if (tool.key === 'image') return false
  return editorUi.state.tool === tool.key
}

// Commit a table of the picked size: drop it centred in view, select it, and
// remember the size for the keyboard-armed quick-place. The catalog closes via
// the caller's togglePopover (#134).
function insertTable({ rows, cols }) {
  const origin = tableInsertOrigin(viewport.visibleRect(), rows, cols)
  const id = store.addTable(origin.x, origin.y, { rows, cols, color: ui.state.penColor })
  if (id) {
    editorUi.setTool('select')
    ui.selectTable(id)
    ui.state.tableRows = rows
    ui.state.tableCols = cols
  }
  shapeQuery.value = ''
}

// Mind map / flowchart arm click-to-place (#75): choosing one closes the catalog and
// arms the pending starter; the first node then lands where the user clicks on the
// canvas (DiagramCanvas → useShapeCreation.placeArmedStarter). This mirrors how a
// shape tile arms draw mode, rather than dropping the node centred in view at once.
function insertMindmap(close) {
  editorUi.armStarter({ kind: 'mindmap' })
  shapeQuery.value = ''
  close?.()
}
function insertFlowchartNode(type, close) {
  editorUi.armStarter({ kind: 'flowchart', nodeType: type })
  shapeQuery.value = ''
  close?.()
}
// Active-highlight for the armed starter, mirroring isArmed for shape tiles.
function isMindmapStarterArmed() {
  return editorUi.state.pendingStarter?.kind === 'mindmap'
}
function isFlowchartStarterArmed(type) {
  const starter = editorUi.state.pendingStarter
  return starter?.kind === 'flowchart' && starter.nodeType === type
}

// Drag a tile onto the canvas to place that shape where you drop it (shapes +
// lines only — the other tools arm a mode rather than drop a fixed shape). The
// polygon has no fixed geometry to drop, so its drag is suppressed here too.
function startTileDrag(event, type) {
  if (NON_DRAGGABLE_SHAPES.includes(type)) return
  startPaletteDrag(event, type, editorUi)
}
// Close the popover only once the drag is over — closing on dragstart would
// unmount the dragged element and cancel the drag in some browsers.
function endTileDrag(close) {
  shapeQuery.value = ''
  close?.()
}

// Select and Hand are merged into one toggle (#238): the icon reflects whichever
// mode is currently active, and the tooltip names the mode a click switches to
// (mirroring flowFlip's "Switch to …" wording below). The underlying tool value
// stays literally 'select' or 'hand' — DiagramCanvas/useKeyboard read those directly.
//
// `icon` holds the COMPLETE lucide utility class throughout this file. Tailwind's
// JIT only emits classes it can read literally, so `lucide-${name}` produces no
// CSS and the icon renders blank — which is why both spellings appear here rather
// than being assembled in the template.
const pointerMode = computed(() =>
  editorUi.state.tool === 'hand'
    ? { icon: 'lucide-hand', label: 'Switch to Select' }
    : { icon: 'lucide-mouse-pointer', label: 'Switch to Hand' },
)
function togglePointerTool() {
  editorUi.setTool(editorUi.state.tool === 'hand' ? 'select' : 'hand')
}
const isPointerToolActive = computed(() => editorUi.state.tool === 'select' || editorUi.state.tool === 'hand')

// Mode-specific tool seam (spec diagram-types C6): a strategy may declare extra
// pointer modes. None today beyond whiteboard's, which render via WhiteboardTools.
const surfaceTools = computed(() => modeStrategy?.value?.surfaceTools || [])

// On the unified bar WhiteboardTools shows ONLY the live annotation modes — the
// merged Draw tool (key 'pen', #242), sticky, table, text, line and image have
// moved into the "+" catalog, leaving eraser / laser (+ the active tool's options
// disclosure). Repositioning Draw onto the bar itself is #240.
const unifiedWhiteboardExclude = ['text', 'line', 'image', 'pen', 'sticky', 'table']

</script>

<template>
  <div
    data-palette
    class="absolute bottom-[18px] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-outline-gray-1 bg-surface-base p-[5px] shadow-lg"
  >
    <!-- CREATE CANVAS (block / unified): pointer modes + guides on the left, the
         big "+" catalog centred, live annotation tools on the right. Equal-weight
         side clusters keep the "+" in the middle (#90). -->
    <template v-if="isCreateCanvas">
      <div class="flex flex-1 basis-0 items-center justify-end gap-1">
        <Button
          :variant="isPointerToolActive ? 'subtle' : 'ghost'"
          theme="gray"
          size="md"
          :icon="pointerMode.icon"
          :tooltip="pointerMode.label"
          :label="pointerMode.label"
          @click="togglePointerTool"
        />
      </div>

      <!-- The primary "add" action: a larger, solid, circular "+" (#83). -->
      <Popover>
        <template #trigger>
          <Button
            class="mx-1 !size-[38px] !rounded-full shadow-sm"
            variant="solid"
            theme="gray"
            size="lg"
            icon="lucide-plus"
            tooltip="Add"
            label="Add"
          />
        </template>
        <template #default="{ toggle }">
          <!-- Six-across catalog: wider than tall, everything visible at a glance. -->
          <div class="w-[256px] p-2">
            <TextInput
              v-model="shapeQuery"
              class="mb-2 w-full"
              type="text"
              variant="outline"
              placeholder="Search…"
              label="Search the insert catalog"
            />

            <div v-if="filteredShapes.length" class="mb-1 text-2xs font-semibold text-ink-gray-4">Shapes</div>
            <div v-if="filteredShapes.length" class="grid grid-cols-6 gap-1">
              <Button
                v-for="s in filteredShapes"
                :key="s.type"
                :variant="isArmed(s.type) ? 'subtle' : 'ghost'"
                theme="gray"
                size="md"
                :tooltip="s.label"
                :label="s.label"
                :draggable="!NON_DRAGGABLE_SHAPES.includes(s.type)"
                @click="arm(s.type, toggle)"
                @dragstart="startTileDrag($event, s.type)"
                @dragend="endTileDrag(toggle)"
              >
                <template #icon>
                  <ShapeGlyph family="block" :type="s.type" class="h-[18px] w-[18px]" />
                </template>
              </Button>
            </div>

            <div v-if="filteredLines.length" class="mb-1 mt-2.5 text-2xs font-semibold text-ink-gray-4">Lines &amp; connectors</div>
            <div v-if="filteredLines.length" class="grid grid-cols-6 gap-1">
              <Button
                v-for="con in filteredLines"
                :key="con.type"
                :variant="isArmed(con.type) ? 'subtle' : 'ghost'"
                theme="gray"
                size="md"
                :icon="con.icon"
                :tooltip="con.label"
                :label="con.label"
                draggable="true"
                @click="arm(con.type, toggle)"
                @dragstart="startTileDrag($event, con.type)"
                @dragend="endTileDrag(toggle)"
              />
            </div>

            <div v-if="filteredTools.length" class="mb-1 mt-2.5 text-2xs font-semibold text-ink-gray-4">Draw &amp; insert</div>
            <div v-if="filteredTools.length" class="grid grid-cols-6 gap-1">
              <template v-for="t in filteredTools" :key="t.key">
                <!-- Table: opens the size picker; picking inserts the table, then
                     closes the picker and the catalog (#134). -->
                <Popover v-if="t.key === 'table'">
                  <template #trigger>
                    <Button variant="ghost" theme="gray" size="md" :icon="t.icon" :tooltip="t.label" :label="t.label" />
                  </template>
                  <template #default="{ toggle: closePicker }">
                    <TableSizePicker @pick="insertTable($event); closePicker(); toggle()" />
                  </template>
                </Popover>
                <Button
                  v-else
                  :variant="isCreateToolActive(t) ? 'subtle' : 'ghost'"
                  theme="gray"
                  size="md"
                  :icon="t.icon"
                  :tooltip="t.label"
                  :label="t.label"
                  @click="runCreateTool(t, toggle)"
                />
              </template>
            </div>

            <div v-if="showMindmap" class="mb-1 mt-2.5 text-2xs font-semibold text-ink-gray-4">Mind map</div>
            <div v-if="showMindmap" class="grid grid-cols-6 gap-1">
              <Button
                :variant="isMindmapStarterArmed() ? 'subtle' : 'ghost'"
                theme="gray"
                size="md"
                tooltip="Parent Node"
                label="Parent Node"
                @click="insertMindmap(toggle)"
              >
                <template #icon>
                  <ShapeGlyph family="mindmap" class="h-[18px] w-[18px]" />
                </template>
              </Button>
            </div>

            <div v-if="filteredFlowchartNodes.length" class="mb-1 mt-2.5 text-2xs font-semibold text-ink-gray-4">Flowchart</div>
            <div v-if="filteredFlowchartNodes.length" class="grid grid-cols-6 gap-1">
              <Button
                v-for="n in filteredFlowchartNodes"
                :key="n.type"
                :variant="isFlowchartStarterArmed(n.type) ? 'subtle' : 'ghost'"
                theme="gray"
                size="md"
                :tooltip="n.label"
                :label="n.label"
                @click="insertFlowchartNode(n.type, toggle)"
              >
                <template #icon>
                  <ShapeGlyph family="flowchart" :type="n.type" class="h-[18px] w-[18px]" />
                </template>
              </Button>
            </div>

            <p v-if="hasNoMatches" class="px-1 py-2 text-center text-xs text-ink-gray-4">No matches</p>
          </div>
        </template>
      </Popover>

      <div class="flex flex-1 basis-0 items-center justify-start gap-1">
        <!-- Live annotation tools (unified only): highlighter / eraser / laser +
             the active tool's options. The catalog owns pen/sticky/table/text/
             line/image, so they're excluded here. -->
        <WhiteboardTools v-if="isUnified" :exclude="unifiedWhiteboardExclude" />
      </div>
    </template>

    <!-- LEGACY single-type docs (mind map / flowchart / whiteboard): their own
         pointer modes + map/tool actions + guides, unchanged. -->
    <template v-else>
      <Button
        :variant="isPointerToolActive ? 'subtle' : 'ghost'"
        theme="gray"
        size="md"
        :icon="pointerMode.icon"
        :tooltip="pointerMode.label"
        :label="pointerMode.label"
        @click="togglePointerTool"
      />

      <!-- Mind map: map-wide actions (per-node editing is in the floating toolbar). -->
      <template v-if="isMindmap">
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
        <Button variant="ghost" theme="gray" size="md" icon="lucide-chevrons-down-up" tooltip="Collapse all" label="Collapse all" @click="collapseAll(store, true)" />
        <Button variant="ghost" theme="gray" size="md" icon="lucide-chevrons-up-down" tooltip="Expand all" label="Expand all" @click="collapseAll(store, false)" />
      </template>

      <!-- Flowchart: map-wide layout actions. -->
      <template v-if="isFlowchart">
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
        <Button variant="ghost" theme="gray" size="md" icon="lucide-grid-2x2" tooltip="Tidy up" label="Tidy up" @click="flowTidy" />
        <Button
          variant="ghost"
          theme="gray"
          size="md"
          :icon="flowDirection === 'TB' ? 'lucide-arrow-right' : 'lucide-arrow-down'"
          :tooltip="flowDirection === 'TB' ? 'Switch to left → right' : 'Switch to top → bottom'"
          label="Flow direction"
          @click="flowFlip"
        />
        <Button
          :variant="flowNumbered ? 'subtle' : 'ghost'"
          theme="gray"
          size="md"
          icon="lucide-list"
          :tooltip="flowNumbered ? 'Clear numbers' : 'Number steps'"
          label="Number steps"
          @click="flowNumber"
        />
      </template>

      <!-- Whiteboard tools: full set for a whiteboard doc. -->
      <WhiteboardTools v-if="isWhiteboard" :exclude="[]" />

      <!-- Any other type declaring extra surface tools (seam; none today). -->
      <template v-else-if="surfaceTools.length">
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
        <Button
          v-for="modeTool in surfaceTools"
          :key="modeTool.tool"
          :variant="editorUi.state.tool === modeTool.tool ? 'subtle' : 'ghost'"
          theme="gray"
          size="md"
          :icon="modeTool.icon"
          :tooltip="modeTool.label"
          :label="modeTool.label"
          @click="editorUi.setTool(modeTool.tool)"
        />
      </template>
    </template>
  </div>
</template>
