<script setup>
// The Select / Hand toggle (#364), moved off the bottom palette.
//
// One control, not two (#238): the icon shows whichever mode is active and the
// tooltip names the mode a click switches to. The underlying tool value stays
// literally 'select' or 'hand', because DiagramCanvas and useKeyboard read those.
//
// `icon` holds the COMPLETE lucide utility class in both branches. Tailwind's JIT
// only emits classes it can read literally, so building one from a variable
// produces no CSS and the icon renders blank.
import { computed } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import ToolbarButton from '../ToolbarButton.vue'

const editorUi = useEditorUi()

const pointerMode = computed(() =>
  editorUi.state.tool === 'hand'
    ? { icon: 'lucide-hand', label: 'Switch to Select' }
    : { icon: 'lucide-mouse-pointer', label: 'Switch to Hand' },
)
const isActive = computed(
  () => editorUi.state.tool === 'select' || editorUi.state.tool === 'hand',
)

function toggle() {
  editorUi.setTool(editorUi.state.tool === 'hand' ? 'select' : 'hand')
}
</script>

<template>
  <ToolbarButton
    allows-blur
    :label="pointerMode.label"
    :icon="pointerMode.icon"
    :active="isActive"
    @click="toggle"
  />
</template>
