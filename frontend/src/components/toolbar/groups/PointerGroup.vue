<script setup>
// The three pointing modes — Select, Hand and the laser pointer — as ONE entry.
//
// It was a Select / Hand toggle (#364, #238: one control rather than two, wearing
// whichever mode is active). The laser joined it because the bar ran 27px over a
// 1280px screen with a mind-map node in a multi-selection, and of everything on
// it the laser was the one worth a click: a presentation aid, reached in bursts,
// against controls used continuously. It belongs with the pointers rather than
// with the tools that write to the document — it is the only "tool" that leaves
// nothing behind.
//
// The trigger still wears the active mode, so which one is on stays readable
// without opening it. It carries no aria-pressed: a menu trigger is not a toggle,
// and the pressed state now lives on the mode inside.
//
// Every `icon` is a COMPLETE lucide utility class. Tailwind's JIT only emits the
// classes it can read literally, so one built from a variable produces no CSS and
// the icon renders blank.
import { computed } from 'vue'
import { Popover } from 'frappe-ui'
import { useEditorUi } from '@/stores/useEditorUi.js'
import ToolbarButton from '../ToolbarButton.vue'

const editorUi = useEditorUi()

// The tool values are literally 'select', 'hand' and 'laser' because
// DiagramCanvas and useKeyboard read those.
const MODES = [
  { tool: 'select', icon: 'lucide-mouse-pointer', label: 'Select' },
  { tool: 'hand', icon: 'lucide-hand', label: 'Hand' },
  { tool: 'laser', icon: 'lucide-circle-dot', label: 'Laser pointer' },
]

// With a drawing tool armed no pointing mode is active, and the trigger falls
// back to the arrow — the mode a click through this menu returns to.
const activeMode = computed(
  () => MODES.find((mode) => mode.tool === editorUi.state.tool) || MODES[0],
)

function pick(mode, close) {
  editorUi.setTool(mode.tool)
  close()
}
</script>

<template>
  <Popover>
    <template #trigger>
      <!-- A test id, because the trigger's label and icon both change with the
           active mode and there is nothing else stable to address it by. -->
      <ToolbarButton
        allows-blur
        data-testid="pointer-modes"
        :label="activeMode.label"
        :icon="activeMode.icon"
      />
    </template>
    <template #default="{ close }">
      <div class="flex gap-1 p-1">
        <ToolbarButton
          v-for="mode in MODES"
          :key="mode.tool"
          allows-blur
          :data-testid="'wtool-' + mode.tool"
          :label="mode.label"
          :icon="mode.icon"
          :active="editorUi.state.tool === mode.tool"
          @click="pick(mode, close)"
        />
      </div>
    </template>
  </Popover>
</template>
