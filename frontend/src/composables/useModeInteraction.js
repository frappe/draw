// Surface-interaction delegation seam (spec diagram-types Part G1/G4). For types
// whose strategy sets handlesSurfaceInteraction:true (flowchart, whiteboard), the
// canvas routes its surface pointerdown/move/up/dblclick/wheel to a "mode
// interaction" object instead of the block/mindmap handling. EditorShell provides
// a single reactive ref via provideModeInteraction(); the active type's
// interaction composable registers its handler object into that ref with
// registerModeInteraction(); DiagramCanvas reads it with useModeInteraction().
//
// A mode interaction object is a plain object of optional handlers, each taking
// (event, context) where context = { point, viewport, store, editorUi } — point
// is already in canvas units (Part G4). Shape:
//   { onPointerDown, onPointerMove, onPointerUp, onDoubleClick, onWheel }
// Any handler that returns true signals "handled"; the canvas then skips its own
// fallback for that event.

import { provide, inject, ref } from 'vue'

const MODE_INTERACTION_KEY = 'modeInteraction'

// Called once in EditorShell. Returns the shared ref so it can also be passed
// around if needed; child components should inject instead.
export function provideModeInteraction() {
  const interaction = ref(null)
  provide(MODE_INTERACTION_KEY, interaction)
  return interaction
}

// Read the shared ref (its .value is the current handler object, or null).
export function useModeInteraction() {
  return inject(MODE_INTERACTION_KEY, ref(null))
}

// A type's interaction composable calls this to install its handler object.
// Pass null on teardown to detach. The given ref is the one from inject/provide.
export function registerModeInteraction(interactionRef, handlers) {
  if (interactionRef) interactionRef.value = handlers || null
}
