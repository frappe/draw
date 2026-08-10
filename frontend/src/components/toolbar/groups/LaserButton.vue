<script setup>
// The laser pointer, split out of the whiteboard tool group so it can sit with
// the view controls at the right of the toolbar. It is a presentation aid, not
// something you add to the canvas, so it does not belong beside Shapes and
// Insert — and unlike its neighbours there it writes nothing to the document.
//
// Metadata comes from whiteboardTools.js so the icon and label stay
// single-sourced with the rest of the tool set, and the `wtool-laser` test id
// travels with it.
import { computed } from 'vue'
import { useEditorUi } from '@/stores/useEditorUi.js'
import { WHITEBOARD_TOOLS } from '@/components/floating/whiteboardTools.js'
import ToolbarButton from '../ToolbarButton.vue'

const editorUi = useEditorUi()

const laser = WHITEBOARD_TOOLS.find((tool) => tool.tool === 'laser')
const isActive = computed(() => editorUi.state.tool === 'laser')
</script>

<template>
  <ToolbarButton
    allows-blur
    data-testid="wtool-laser"
    :label="laser.label"
    :icon="laser.icon"
    :active="isActive"
    @click="editorUi.setTool('laser')"
  />
</template>
