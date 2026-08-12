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
import { Popover } from 'frappe-ui'
import {
  useInsertCatalog,
  SHAPES,
  LINES,
  FLOWCHART_NODES,
  NON_DRAGGABLE_SHAPES,
} from '@/composables/useInsertCatalog.js'
import ShapeGlyph from '@/components/floating/ShapeGlyph.vue'
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
  insertMindmap,
  insertFlowchartNode,
  isMindmapStarterArmed,
  isFlowchartStarterArmed,
  startTileDrag,
  endTileDrag,
} = useInsertCatalog()

const grid = 'grid w-[228px] grid-cols-6 gap-1 p-2'
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
          :tooltip="shape.type === 'rectangle' ? 'Rectangle — hold Shift for a square' : undefined"
          :active="isArmed(shape.type)"
          :draggable="!NON_DRAGGABLE_SHAPES.includes(shape.type)"
          @click="arm(shape.type, toggle)"
          @dragstart="startTileDrag($event, shape.type)"
          @dragend="endTileDrag(toggle)"
        />
      </div>
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
      tooltip="Mind map — click the canvas to place the parent node"
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
