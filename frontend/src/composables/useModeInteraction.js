// Surface-interaction delegation seam (spec diagram-types Part G1/G4). For types
// whose strategy sets handlesSurfaceInteraction:true (flowchart, whiteboard), the
// canvas routes its surface pointerdown/move/up/dblclick/wheel to a "mode
// interaction" object instead of the block/mindmap handling. EditorShell provides
// a single reactive REGISTRY via provideModeInteraction(); each active layer's
// interaction composable registers its handler object under a stable layer key
// with registerModeInteraction(); DiagramCanvas resolves the right handler for the
// active tool with resolveModeHandlers() and delegates to it.
//
// Why a keyed registry (not a single slot): the unified canvas (roadmap: canvas
// unification) mounts multiple type layers at once, so more than one can register
// simultaneously. Keying by layer + resolving by the active tool avoids the
// last-writer-wins collision a single ref would have. A legacy single-type
// document registers exactly ONE surface layer, so the resolver returns it
// unchanged — behaviour is identical to the old single-slot seam.
//
// A mode interaction object is a plain object of optional handlers, each taking
// (event, context) where context = { point, viewport, store, editorUi } — point
// is already in canvas units (Part G4). Shape:
//   { onPointerDown, onPointerMove, onPointerUp, onDoubleClick, onWheel }
// Any handler that returns true signals "handled"; the canvas then skips its own
// fallback for that event.

import { provide, inject, ref } from 'vue'

const MODE_INTERACTION_KEY = 'modeInteraction'

// Whiteboard tools with NO block equivalent — on the unified canvas these route
// surface events to the whiteboard layer. Deliberately excludes the tools that
// collide with block on a shared canvas: 'line' (block owns the connector line),
// 'text' and 'image' (block owns those). Legacy single-type whiteboards are
// unaffected — the sole-registrant rule routes every tool to them regardless.
const WHITEBOARD_TOOLS = new Set([
  'pen',
  'highlighter',
  'eraser',
  'sticky',
  'table',
  'laser',
])

// Whether a tool is an unambiguous whiteboard tool (used to route surface events
// on the unified canvas, where block and whiteboard share the tool namespace).
export function isWhiteboardTool(tool) {
  return WHITEBOARD_TOOLS.has(tool)
}

// Called once in EditorShell/ViewerPage. Returns the shared registry ref (a map
// of layerKey -> handler object); child components inject instead.
export function provideModeInteraction() {
  const registry = ref({})
  provide(MODE_INTERACTION_KEY, registry)
  return registry
}

// Read the shared registry ref (its .value is { layerKey: handlers }).
export function useModeInteraction() {
  return inject(MODE_INTERACTION_KEY, ref({}))
}

// A layer's interaction composable calls this to install/detach its handler
// object under a stable key ('whiteboard', 'flowchart', …). Pass null handlers to
// detach on unmount. Reassigns the ref value so readers react.
export function registerModeInteraction(registryRef, layerKey, handlers) {
  if (!registryRef) return
  const next = { ...registryRef.value }
  if (handlers) next[layerKey] = handlers
  else delete next[layerKey]
  registryRef.value = next
}

// Resolve which registered layer owns surface events for the active tool. Pure so
// it is unit-testable. Returns the handler object or null.
//   • no registrants        → null (shared block/mindmap fallback handles it)
//   • exactly one registrant → that one, regardless of tool (legacy single-type)
//   • several (unified)      → whiteboard tools to the whiteboard layer, else the
//                              first non-whiteboard registrant
export function resolveModeHandlers(registry, activeTool) {
  const keys = Object.keys(registry || {})
  if (keys.length === 0) return null
  if (keys.length === 1) return registry[keys[0]]
  if (WHITEBOARD_TOOLS.has(activeTool) && registry.whiteboard) return registry.whiteboard
  const other = keys.find((key) => key !== 'whiteboard')
  return registry[other] || registry[keys[0]]
}
