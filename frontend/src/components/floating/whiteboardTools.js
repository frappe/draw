// The whiteboard tool palette, split out from WhiteboardTools.vue so the tool
// list and its visibility rule can be unit-tested without a DOM (vitest runs in
// the node environment — CONVENTIONS: keep domain logic browser-free). Nothing
// here touches Vue; the .vue file renders what these return.

// Every tool the whiteboard / unified bar can offer, in palette order.
export const WHITEBOARD_TOOLS = [
  { tool: 'pen', icon: 'pen-line', label: 'Pen' },
  { tool: 'highlighter', icon: 'highlighter', label: 'Highlighter' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser' },
  { tool: 'text', icon: 'type', label: 'Text' },
  { tool: 'sticky', icon: 'sticky-note', label: 'Sticky note' },
  { tool: 'line', icon: 'minus', label: 'Line' },
  { tool: 'table', icon: 'table', label: 'Table' },
  { tool: 'laser', icon: 'circle-dot', label: 'Laser pointer' },
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
