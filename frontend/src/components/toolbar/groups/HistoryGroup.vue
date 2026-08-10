<script setup>
// Undo and redo.
//
// Both were fully wired in the store — `store.undo`, `store.redo`, and the
// `canUndo` / `canRedo` computeds — and reachable only by keyboard. Nothing in
// the interface had ever called them, so anyone who did not know the shortcut
// had no way back from a mistake. Every comparable editor puts them on the bar.
//
// They lead the toolbar, which is where Slides, Docs and Figma all put them.
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
