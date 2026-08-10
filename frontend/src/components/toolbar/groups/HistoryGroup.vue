<script setup>
// Undo and redo.
//
// Both were fully wired in the store — `store.undo`, `store.redo` and the
// `canUndo` / `canRedo` computeds — and reachable only by keyboard. Nothing in
// the interface had ever called them, so anyone who did not know the shortcut
// had no way back from a mistake.
//
// They lead the bar, which is where Slides, Docs and Figma all put them, and
// they sit ahead of the contextual groups so they never move.
//
// `allows-blur` matters more here than anywhere else on the bar. Clicking Undo
// while a shape's label is being edited must let that edit commit first;
// holding the caret would undo the step BEFORE the edit and then commit the
// pending text back on top of it.
import { useDiagramStore } from '@/stores/useDiagramStore.js'
import ToolbarButton from '../ToolbarButton.vue'

const store = useDiagramStore()
</script>

<template>
  <ToolbarButton
    allows-blur
    label="Undo"
    tooltip="Undo (⌘Z)"
    icon="lucide-undo-2"
    :disabled="!store.canUndo"
    @click="store.undo()"
  />
  <ToolbarButton
    allows-blur
    label="Redo"
    tooltip="Redo (⇧⌘Z)"
    icon="lucide-redo-2"
    :disabled="!store.canRedo"
    @click="store.redo()"
  />
</template>
