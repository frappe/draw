<script setup>
// The insert cluster (#364): the five categories the bottom palette's "+" catalog
// already had, promoted to one toolbar entry each — and then Text, Sticky note,
// Image and Table promoted again, out of the "Insert" dropdown and onto the bar.
// A dropdown is worth its click when it hides a grid of nine shapes; over four
// items it is only a lid.
//
// Shapes and Lines keep drag-to-place, including the deferred close — closing on
// dragstart unmounts the dragged element and cancels the drag in some browsers,
// so the menu closes on dragend instead.
import { ref } from 'vue'
import { Popover } from 'frappe-ui'
import {
  useInsertCatalog,
  SHAPES,
  LINES,
  FLOWCHART_NODES,
  NON_DRAGGABLE_SHAPES,
} from '@/composables/useInsertCatalog.js'
import ShapeGlyph from '@/components/floating/ShapeGlyph.vue'
import PolygonSidesPicker from '@/components/floating/PolygonSidesPicker.vue'
import TableSizePicker from '@/components/floating/TableSizePicker.vue'
import ToolbarButton from '../ToolbarButton.vue'

const {
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
} = useInsertCatalog()

// A menu is as wide as its tiles (#489). Both of these carried a fixed width
// computed from a 34px tile — ToolbarButton renders 28 — so every menu reserved a
// visible empty run to the right of its last tile: 24px on Lines, 32px on Shapes.
// On Shapes the slack hid across two rows; on Lines it was a quarter of a
// single-row box.
//
// The column count stays; only the width goes. A grid with no width is exactly as
// wide as its contents and cannot drift the next time the tile size moves, which is
// the second time a hard-coded box has been computed from the wrong tile.
const GRID = 'grid gap-1 p-2'
// Five across (#470). The Shapes menu holds ten tiles now — Trapezoid and
// Parallelogram joined the eight of #451 item 3 — so five columns fill two rows
// exactly with no gap at the end, where four would have left a half-empty third row.
const shapesGrid = `${GRID} grid-cols-5`
// Lines and the flowchart nodes keep four across, which fills their rows. They are
// named separately rather than sharing one constant: the two menus hold different
// numbers of tiles, so a column count that suits both is a coincidence, not a rule.
const linesGrid = `${GRID} grid-cols-4`
const flowchartGrid = `${GRID} grid-cols-4`

// The side-count prompt opens inside the Shapes menu, replacing the tile that
// asked for it. A second Popover nested in this one would close the outer menu on
// its own outside-press, which reads as the prompt dismissing the whole menu.
const askingSides = ref(false)
function closeSides(toggle) {
  askingSides.value = false
  toggle?.()
}
</script>

<template>
  <Popover>
    <template #trigger><ToolbarButton allows-blur label="Shapes" icon="lucide-shapes" /></template>
    <template #default="{ toggle }">
      <div :class="shapesGrid">
        <ToolbarButton
          allows-blur
          v-for="shape in SHAPES"
          :key="shape.type"
          :label="shape.label"
          :icon="shape.icon"
          :active="isArmed(shape.type)"
          :draggable="!NON_DRAGGABLE_SHAPES.includes(shape.type)"
          @click="arm(shape.type, toggle)"
          @dragstart="startTileDrag($event, shape.type)"
          @dragend="endTileDrag(toggle)"
        >
          <!-- Trapezoid and Parallelogram have no Lucide icon, so they draw their
               own outline (#470). Same mechanism the Lines menu uses. -->
          <template v-if="shape.glyph" #icon>
            <ShapeGlyph :family="shape.glyph" :type="shape.type" class="size-4" />
          </template>
        </ToolbarButton>
        <!-- The last tile asks for a side count before it inserts anything, so
             it swaps this menu's contents rather than arming a tool. It is not
             draggable: there is no shape to drop until the count is known. -->
        <ToolbarButton
          v-if="!askingSides"
          allows-blur
          label="Custom polygon"
          @click="askingSides = true"
        >
          <template #icon><ShapeGlyph family="polygon-n" class="size-4" /></template>
        </ToolbarButton>
      </div>
      <PolygonSidesPicker
        v-if="askingSides"
        @cancel="askingSides = false"
        @pick="insertRegularPolygon($event, () => closeSides(toggle))"
      />
    </template>
  </Popover>

  <!-- The trigger wears the same drawn line glyph as the tile it opens (#457).
       They have to move together, or the bar stops matching the menu. -->
  <Popover>
    <template #trigger>
      <ToolbarButton allows-blur label="Lines">
        <template #icon><ShapeGlyph family="line" class="size-4" /></template>
      </ToolbarButton>
    </template>
    <template #default="{ toggle }">
      <div :class="linesGrid">
        <ToolbarButton
          allows-blur
          v-for="connector in LINES"
          :key="connector.type"
          :label="connector.label"
          :icon="connector.icon"
          :active="isArmed(connector.type)"
          draggable="true"
          @click="arm(connector.type, toggle)"
          @dragstart="startTileDrag($event, connector.type)"
          @dragend="endTileDrag(toggle)"
        >
          <template v-if="connector.glyph" #icon>
            <ShapeGlyph :family="connector.glyph" class="size-4" />
          </template>
        </ToolbarButton>
      </div>
    </template>
  </Popover>

  <!-- Text, Sticky note, Image and Table are entries in their own right. They
       spent #364 inside an "Insert" dropdown, which cost two clicks to reach the
       four things people place most often — and the dropdown held nothing else,
       so it was a lid on a box with four items in it. -->
  <template v-for="tool in insertTools" :key="tool.key">
    <!-- Table still opens the size picker, which inserts on pick and closes it. -->
    <Popover v-if="tool.key === 'table'">
      <template #trigger><ToolbarButton allows-blur :label="tool.label" :icon="tool.icon" /></template>
      <template #default="{ toggle }">
        <TableSizePicker @pick="insertTable($event, toggle)" />
      </template>
    </Popover>
    <ToolbarButton
      v-else
      allows-blur
      :label="tool.label"
      :icon="tool.icon"
      :active="isCreateToolActive(tool)"
      @click="runCreateTool(tool)"
    />
  </template>

  <template v-if="showsStarters">
    <ToolbarButton
      allows-blur
      label="Mind map"
      :active="isMindmapStarterArmed()"
      @click="insertMindmap()"
    >
      <template #icon><ShapeGlyph family="mindmap" class="size-4" /></template>
    </ToolbarButton>

    <Popover>
      <!-- `lucide-network` — a parent box over two child boxes, which is what a
           flowchart looks like and what its nodes are drawn as. `lucide-git-branch`
           said nothing about a flowchart, and the Branches control next door still
           wears it, so the two menus used to be indistinguishable (#459). -->
      <template #trigger><ToolbarButton allows-blur label="Flowchart" icon="lucide-network" /></template>
      <template #default="{ toggle }">
        <div :class="flowchartGrid">
          <ToolbarButton
            allows-blur
            v-for="node in FLOWCHART_NODES"
            :key="node.type"
            :label="node.label"
            :active="isFlowchartStarterArmed(node.type)"
            @click="insertFlowchartNode(node.type, toggle)"
          >
            <template #icon><ShapeGlyph family="flowchart" :type="node.type" class="size-4" /></template>
          </ToolbarButton>
        </div>
      </template>
    </Popover>
  </template>
</template>
