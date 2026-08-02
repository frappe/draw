<script setup>
// Floating bottom-center palette. On the create canvas (block / unified) the big
// circular "+" is the centrepiece: it opens ONE catalog of everything you can add
// — shapes, lines, pen, text, sticky, image, table, a mind map, and every
// flowchart shape — clubbed into labelled sections (#90). The live annotation
// tools that you toggle between while sketching (highlighter / eraser / laser) and
// the guides control stay on the bar so switching them never needs a menu. Legacy
// single-type docs keep their own map/tool actions. Wired to editorUi + viewport.
import { computed, ref } from 'vue'
import { Tooltip, Popover } from 'frappe-ui'
import LucideIcon from '@/icons/LucideIcon.vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { useModeStrategy } from '@/stores/useModeStrategy.js'
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import { isUnifiedDocument } from '@/diagram/schema.js'
import { useImageInsert } from '@/composables/useImageInsert.js'
import { startPaletteDrag } from '@/composables/useShapeCreation.js'
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
// Icons are drawn by ShapeGlyph so each tile is the actual shape it inserts.
const SHAPES = [
  { type: 'rectangle', label: 'Rectangle' },
  { type: 'square', label: 'Square' },
  { type: 'rounded', label: 'Rounded rectangle' },
  { type: 'ellipse', label: 'Ellipse' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'diamond', label: 'Diamond' },
  { type: 'hexagon', label: 'Hexagon' },
  { type: 'arrow', label: 'Block arrow' },
]
// A plain Line has no arrowheads; Arrow ends in an arrow; elbow/curved too. The
// arrow connector's id is namespaced so it never collides with the 'arrow'
// block-arrow SHAPE above (they'd both key `byType` and the draw tool).
const LINES = [
  { type: 'line', icon: 'minus', label: 'Line' },
  { type: 'connector-arrow', icon: 'arrow-right', label: 'Arrow' },
  { type: 'elbow', icon: 'corner-down-right', label: 'Elbow connector' },
  { type: 'curved', icon: 'git-commit', label: 'Curved connector' },
]
// Everything else you place once, folded into the catalog (#90). `surface` tools
// (pen / sticky / table) draw onto the whiteboard layer, so they only apply to the
// unified canvas; text + image are block-owned and work on any create canvas.
const CREATE_TOOLS = [
  { key: 'pen', icon: 'pen-line', label: 'Pen', surface: true },
  { key: 'text', icon: 'type', label: 'Text', surface: false },
  { key: 'sticky', icon: 'sticky-note', label: 'Sticky note', surface: true },
  { key: 'image', icon: 'image', label: 'Image', surface: false },
  { key: 'table', icon: 'table', label: 'Table', surface: true },
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
const showMindmap = computed(() => isUnified.value && (!query.value || 'mind map'.includes(query.value)))
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
  if (tool.key === 'image') imageInsert.pick()
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

function insertMindmap(close) {
  store.insertMindmapStarter(viewport.visibleRect())
  shapeQuery.value = ''
  close?.()
}
function insertFlowchartNode(type, close) {
  store.insertFlowchartStarter(viewport.visibleRect(), type)
  shapeQuery.value = ''
  close?.()
}

// Drag a tile onto the canvas to place that shape where you drop it (shapes +
// lines only — the other tools arm a mode rather than drop a fixed shape).
function startTileDrag(event, type) {
  startPaletteDrag(event, type, editorUi)
}
// Close the popover only once the drag is over — closing on dragstart would
// unmount the dragged element and cancel the drag in some browsers.
function endTileDrag(close) {
  shapeQuery.value = ''
  close?.()
}

const modes = [
  { tool: 'select', icon: 'mouse-pointer', label: 'Select' },
  { tool: 'hand', icon: 'hand', label: 'Hand' },
]

// Mode-specific tool seam (spec diagram-types C6): a strategy may declare extra
// pointer modes. None today beyond whiteboard's, which render via WhiteboardTools.
const surfaceTools = computed(() => modeStrategy?.value?.surfaceTools || [])

// On the unified bar WhiteboardTools shows ONLY the live annotation modes — pen,
// sticky, table, text, line and image have moved into the "+" catalog, leaving
// highlighter / eraser / laser (+ the active tool's options disclosure).
const unifiedWhiteboardExclude = ['text', 'line', 'image', 'pen', 'sticky', 'table']

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'
function toggleClass(active) {
  return active ? 'bg-surface-gray-2 text-ink-gray-9' : ''
}
const tileBase = 'flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-gray-2'
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
        <Tooltip v-for="mode in modes" :key="mode.tool" :text="mode.label">
          <button
            :class="[buttonBase, toggleClass(editorUi.state.tool === mode.tool)]"
            @click="editorUi.setTool(mode.tool)"
          >
            <LucideIcon :name="mode.icon" class="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      <!-- The primary "add" action: a larger, solid, circular "+" (#83). -->
      <Popover>
        <template #target="{ togglePopover }">
          <Tooltip text="Add">
            <button
              class="mx-1 flex h-[38px] w-[38px] items-center justify-center rounded-full bg-surface-gray-10 text-ink-base shadow-sm transition-colors hover:bg-surface-gray-9 active:bg-surface-gray-8"
              aria-label="Add"
              @click="togglePopover()"
            >
              <LucideIcon name="plus" class="h-5 w-5" />
            </button>
          </Tooltip>
        </template>
        <template #body-main="{ togglePopover }">
          <!-- Six-across catalog: wider than tall, everything visible at a glance. -->
          <div class="w-[256px] p-2">
            <input
              v-model="shapeQuery"
              type="text"
              placeholder="Search…"
              class="mb-2 h-7 w-full rounded-md border border-outline-gray-2 bg-surface-base px-2 text-xs text-ink-gray-8 outline-none placeholder:text-ink-gray-4 focus:border-outline-gray-3"
            />

            <div v-if="filteredShapes.length" class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Shapes</div>
            <div v-if="filteredShapes.length" class="grid grid-cols-6 gap-1">
              <Tooltip v-for="s in filteredShapes" :key="s.type" :text="s.label">
                <button
                  :class="[tileBase, isArmed(s.type) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7']"
                  draggable="true"
                  @click="arm(s.type, togglePopover)"
                  @dragstart="startTileDrag($event, s.type)"
                  @dragend="endTileDrag(togglePopover)"
                >
                  <ShapeGlyph family="block" :type="s.type" class="h-[18px] w-[18px]" />
                </button>
              </Tooltip>
            </div>

            <div v-if="filteredLines.length" class="mb-1 mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Lines &amp; connectors</div>
            <div v-if="filteredLines.length" class="grid grid-cols-6 gap-1">
              <Tooltip v-for="con in filteredLines" :key="con.type" :text="con.label">
                <button
                  :class="[tileBase, isArmed(con.type) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7']"
                  draggable="true"
                  @click="arm(con.type, togglePopover)"
                  @dragstart="startTileDrag($event, con.type)"
                  @dragend="endTileDrag(togglePopover)"
                >
                  <LucideIcon :name="con.icon" class="h-[18px] w-[18px]" />
                </button>
              </Tooltip>
            </div>

            <div v-if="filteredTools.length" class="mb-1 mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Draw &amp; insert</div>
            <div v-if="filteredTools.length" class="grid grid-cols-6 gap-1">
              <Tooltip v-for="t in filteredTools" :key="t.key" :text="t.label">
                <button
                  :class="[tileBase, isCreateToolActive(t) ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7']"
                  @click="runCreateTool(t, togglePopover)"
                >
                  <LucideIcon :name="t.icon" class="h-[18px] w-[18px]" />
                </button>
              </Tooltip>
            </div>

            <div v-if="showMindmap" class="mb-1 mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Mind map</div>
            <div v-if="showMindmap" class="grid grid-cols-6 gap-1">
              <Tooltip text="Mind map">
                <button :class="[tileBase, 'text-ink-gray-7']" @click="insertMindmap(togglePopover)">
                  <ShapeGlyph family="mindmap" class="h-[18px] w-[18px]" />
                </button>
              </Tooltip>
            </div>

            <div v-if="filteredFlowchartNodes.length" class="mb-1 mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-gray-4">Flowchart</div>
            <div v-if="filteredFlowchartNodes.length" class="grid grid-cols-6 gap-1">
              <Tooltip v-for="n in filteredFlowchartNodes" :key="n.type" :text="n.label">
                <button :class="[tileBase, 'text-ink-gray-7']" @click="insertFlowchartNode(n.type, togglePopover)">
                  <ShapeGlyph family="flowchart" :type="n.type" class="h-[18px] w-[18px]" />
                </button>
              </Tooltip>
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
      <Tooltip v-for="mode in modes" :key="mode.tool" :text="mode.label">
        <button
          :class="[buttonBase, toggleClass(editorUi.state.tool === mode.tool)]"
          @click="editorUi.setTool(mode.tool)"
        >
          <LucideIcon :name="mode.icon" class="h-4 w-4" />
        </button>
      </Tooltip>

      <!-- Mind map: map-wide actions (per-node editing is in the floating toolbar). -->
      <template v-if="isMindmap">
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
        <Tooltip text="Collapse all">
          <button :class="buttonBase" @click="collapseAll(store, true)"><LucideIcon name="chevrons-down-up" class="h-4 w-4" /></button>
        </Tooltip>
        <Tooltip text="Expand all">
          <button :class="buttonBase" @click="collapseAll(store, false)"><LucideIcon name="chevrons-up-down" class="h-4 w-4" /></button>
        </Tooltip>
      </template>

      <!-- Flowchart: map-wide layout actions. -->
      <template v-if="isFlowchart">
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
        <Tooltip text="Tidy up">
          <button :class="buttonBase" @click="flowTidy"><LucideIcon name="grid" class="h-4 w-4" /></button>
        </Tooltip>
        <Tooltip :text="flowDirection === 'TB' ? 'Switch to left → right' : 'Switch to top → bottom'">
          <button :class="buttonBase" @click="flowFlip"><LucideIcon :name="flowDirection === 'TB' ? 'arrow-right' : 'arrow-down'" class="h-4 w-4" /></button>
        </Tooltip>
        <Tooltip :text="flowNumbered ? 'Clear numbers' : 'Number steps'">
          <button :class="[buttonBase, toggleClass(flowNumbered)]" @click="flowNumber"><LucideIcon name="list" class="h-4 w-4" /></button>
        </Tooltip>
      </template>

      <!-- Whiteboard tools: full set for a whiteboard doc. -->
      <WhiteboardTools v-if="isWhiteboard" :exclude="[]" />

      <!-- Any other type declaring extra surface tools (seam; none today). -->
      <template v-else-if="surfaceTools.length">
        <div class="mx-0.5 h-5 w-px bg-surface-gray-3" />
        <Tooltip v-for="modeTool in surfaceTools" :key="modeTool.tool" :text="modeTool.label">
          <button
            :class="[buttonBase, toggleClass(editorUi.state.tool === modeTool.tool)]"
            @click="editorUi.setTool(modeTool.tool)"
          >
            <LucideIcon :name="modeTool.icon" class="h-4 w-4" />
          </button>
        </Tooltip>
      </template>
    </template>
  </div>
</template>
