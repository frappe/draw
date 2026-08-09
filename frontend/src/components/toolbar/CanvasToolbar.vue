<script setup>
// The static canvas toolbar (#359). One bar below the title bar and above the
// ruler, holding every control that used to float over the canvas, with contents
// that follow the selection.
//
// It replaces eight separate floating bars. Those anchored themselves above the
// selection, so a shape near the top of the canvas pushed its toolbar over the
// title bar, and every control moved on each pan, zoom and selection change.
//
// The item contract mirrors frappe-ui's own EditorFixedMenu: ghost buttons,
// pressed state through aria-pressed, one shared TooltipProvider so neighbouring
// tooltips open without re-delay, and the same data-slot hooks. The menu itself
// is ours because EditorFixedMenu binds to a Tiptap editor, and this one drives
// four canvas models.
//
// This phase (#360) mounts the frame and the canvas-level group. The insert
// cluster and the contextual groups arrive with #361 to #364.
import { TooltipProvider } from 'frappe-ui'
import CanvasGroup from './groups/CanvasGroup.vue'
</script>

<template>
  <div
    data-canvas-toolbar
    data-slot="fixed-menu"
    class="flex h-10 flex-none items-center gap-1 overflow-x-auto border-b border-outline-gray-1 bg-surface-base px-3"
  >
    <TooltipProvider>
      <!-- Left and contextual clusters land here in #361 to #364. The spacer
           holds the canvas group at the right end from the start, so entries do
           not shift sideways as later phases fill the bar in. -->
      <div class="min-w-0 flex-1" />
      <CanvasGroup />
    </TooltipProvider>
  </div>
</template>
