<script setup>
// Floating bottom-center palette (spec §7.1, README 4c): pointer modes (select /
// hand / draw), grid-guide toggle, and zoom controls (out / 100% reset / in /
// fit). Wired to editorUi tool/grid and the viewport.
import { Tooltip, FeatherIcon } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'

const editorUi = useEditorUi()
const viewport = editorUi.viewport

const modes = [
  { tool: 'select', icon: 'mouse-pointer', label: 'Select' },
  { tool: 'hand', icon: 'move', label: 'Pan' },
  { tool: 'draw', icon: 'plus', label: 'Draw' },
]

const buttonBase =
  'flex h-[34px] w-[34px] items-center justify-center rounded-md text-ink-gray-7 hover:bg-surface-gray-2'

function toggleClass(active) {
  return active ? 'bg-surface-gray-2 text-ink-gray-9' : ''
}
</script>

<template>
  <div
    class="absolute bottom-[18px] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-outline-gray-1 bg-surface-white p-[5px] shadow-lg"
  >
    <Tooltip v-for="mode in modes" :key="mode.tool" :text="mode.label">
      <button
        :class="[buttonBase, toggleClass(editorUi.state.tool === mode.tool)]"
        @click="editorUi.setTool(mode.tool)"
      >
        <FeatherIcon :name="mode.icon" class="h-4 w-4" />
      </button>
    </Tooltip>

    <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />

    <Tooltip text="Grid guides">
      <button
        :class="[buttonBase, toggleClass(editorUi.state.gridVisible)]"
        @click="editorUi.toggleGrid()"
      >
        <FeatherIcon name="grid" class="h-4 w-4" />
      </button>
    </Tooltip>

    <div class="mx-0.5 h-5 w-px bg-outline-gray-1" />

    <Tooltip text="Zoom out">
      <button :class="buttonBase" @click="viewport.zoomStep(-1)">
        <FeatherIcon name="minus" class="h-4 w-4" />
      </button>
    </Tooltip>
    <Tooltip text="Reset to 100%">
      <button
        class="h-[34px] min-w-[46px] rounded-md px-1.5 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-2"
        @click="editorUi.reset100()"
      >
        {{ editorUi.zoomPercent }}%
      </button>
    </Tooltip>
    <Tooltip text="Zoom in">
      <button :class="buttonBase" @click="viewport.zoomStep(1)">
        <FeatherIcon name="plus" class="h-4 w-4" />
      </button>
    </Tooltip>
    <Tooltip text="Fit to view">
      <button :class="buttonBase" @click="editorUi.fit()">
        <FeatherIcon name="maximize-2" class="h-4 w-4" />
      </button>
    </Tooltip>
  </div>
</template>
