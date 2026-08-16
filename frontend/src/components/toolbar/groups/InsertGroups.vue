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

// Four across (#451 item 3). The Shapes menu holds eight tiles, so four columns
// fill two rows exactly with no gap at the end; Lines has four and fills one row.
const grid = 'grid w-[164px] grid-cols-4 gap-1 p-2'

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
      <div :class="grid">
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
        />
        <!-- The eighth tile asks for a side count before it inserts anything, so
             it swaps this menu's contents rather than arming a tool. It is not
             draggable: there is no shape to drop until the count is known. -->
        <ToolbarButton
          v-if="!askingSides"
          allows-blur
          label="Custom polygon"
          @click="askingSides = true"
        >
          <template #icon><ShapeGlyph family="polygon-n" class="h-[18px] w-[18px]" /></template>
        </ToolbarButton>
      </div>
      <PolygonSidesPicker
        v-if="askingSides"
        @cancel="askingSides = false"
        @pick="insertRegularPolygon($event, () => closeSides(toggle))"
      />
    </template>
  </Popover>

  <Popover>
    <template #trigger><ToolbarButton allows-blur label="Lines" icon="lucide-minus" /></template>
    <template #default="{ toggle }">
      <div :class="grid">
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
        />
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
      <template #icon><ShapeGlyph family="mindmap" class="h-[18px] w-[18px]" /></template>
    </ToolbarButton>

    <Popover>
      <template #trigger><ToolbarButton allows-blur label="Flowchart" icon="lucide-git-branch" /></template>
      <template #default="{ toggle }">
        <div :class="grid">
          <ToolbarButton
            allows-blur
            v-for="node in FLOWCHART_NODES"
            :key="node.type"
            :label="node.label"
            :active="isFlowchartStarterArmed(node.type)"
            @click="insertFlowchartNode(node.type, toggle)"
          >
            <template #icon><ShapeGlyph family="flowchart" :type="node.type" class="h-[18px] w-[18px]" /></template>
          </ToolbarButton>
        </div>
      </template>
    </Popover>
  </template>
</template>
