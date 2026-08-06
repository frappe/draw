// The whiteboard tool palette, split out from WhiteboardTools.vue so the tool
// list and its visibility rule can be unit-tested without a DOM (vitest runs in
// the node environment — CONVENTIONS: keep domain logic browser-free). Nothing
// here touches Vue; the .vue file renders what these return.

// Every tool the whiteboard / unified bar can offer, in palette order.
//
// Pen + highlighter are merged into one "Draw" tool (#242): the options popover
// (WhiteboardTools.vue) picks the ink via ui.state.drawKind ('pen'|'highlighter').
// The internal `tool` id stays 'pen' (not 'draw') on purpose — 'draw' already names
// the block canvas's generic shape-drag-draw tool (editorUi.state.tool +
// drawShapeType, see stores/useEditorUi.js). Reusing that literal here would make
// the merged Draw tool collide with rectangle/line/etc. placement on the unified
// canvas (delegatesSurface() in DiagramCanvas.vue routes surface events by tool
// name), so the label reads "Draw" while the tool id keeps its established 'pen'
// identity.
//
// `icon` holds the COMPLETE lucide utility class, not a bare name. Tailwind's
// JIT only emits classes it can read literally in the source, so a template like
// `lucide-${name}` produces no CSS and the icon renders blank.
export const WHITEBOARD_TOOLS = [
  { tool: 'pen', icon: 'lucide-pen-line', label: 'Draw' },
  { tool: 'eraser', icon: 'lucide-eraser', label: 'Eraser' },
  { tool: 'text', icon: 'lucide-type', label: 'Text' },
  { tool: 'sticky', icon: 'lucide-sticky-note', label: 'Sticky note' },
  { tool: 'line', icon: 'lucide-minus', label: 'Line' },
  { tool: 'table', icon: 'lucide-table', label: 'Table' },
  { tool: 'laser', icon: 'lucide-circle-dot', label: 'Laser pointer' },
]

// Tools shown on the bar, minus any the surrounding context already provides
// (`exclude` — the unified bar owns pen/text/line/etc. through its own catalog).
// The eraser is always offered: its object mode removes shapes, stickies,
// flowchart and mind-map nodes too, so it must stay reachable even on a board
// with no freehand ink — a unified canvas whose only content lives in a
// mind-map / flowchart sub-model still needs it (#103).
export function visibleWhiteboardTools(exclude = []) {
  return WHITEBOARD_TOOLS.filter((t) => !exclude.includes(t.tool))
}
