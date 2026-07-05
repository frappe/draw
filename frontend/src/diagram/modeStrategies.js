// Mode strategies (spec diagram-types Part G1). One shared editor; the strategy
// for the diagram's `diagramType` declares how that type behaves so the canvas,
// palettes and interactions can branch without forking the editor. M1 only needs
// the rendering + auto-layout flags; palette/keyboard fields are filled by M2+.

// Strategy fields the shared seams branch on:
// - rendersOwnLayer: the canvas draws this type's own <…Layer> instead of the
//   block shape/connector loops.
// - isAutoLayout: positions are computed (mindmap); the user never free-places.
// - hasBoundedPaper: a fixed white paper rect (block/flowchart) vs a freely
//   auto-expanding surface (mindmap/whiteboard, spec §1).
// - handlesSurfaceInteraction: the type owns surface pointer/dblclick/wheel,
//   delegated through inject('modeInteraction') (see DiagramCanvas).
// - keyboardMode: selects the per-mode keyboard handler in useKeyboard.
// - surfaceTools: extra pointer-mode buttons the BottomPalette renders for this
//   type (spec C6 whiteboard pen/highlighter/eraser/text/sticky/laser). Each is
//   { tool, icon, label }; clicking it sets editorUi tool to `tool`. The type's
//   mode-interaction composable reads editorUi.state.tool to act on it. Empty for
//   block/mindmap (they use only the shared select/hand/draw modes).

const BLOCK = {
  type: 'block',
  rendersOwnLayer: false, // uses the shared shape/connector render path
  isAutoLayout: false,
  hasBoundedPaper: true,
  handlesSurfaceInteraction: false,
  keyboardMode: 'block',
  surfaceTools: [],
  showsShapeTools: true, // left creation palette (shapes/connectors/icons)
  // No right panel: shape editing lives in the floating contextual toolbar
  // (BlockSelectionEditor); creation + canvas settings in the bottom palette.
}

const MINDMAP = {
  type: 'mindmap',
  rendersOwnLayer: true, // MindMapNodeLayer draws the laid-out tree
  isAutoLayout: true, // positions are computed; the user never free-places nodes
  hasBoundedPaper: false, // freely auto-expanding canvas (spec A2)
  handlesSurfaceInteraction: false, // node interactions live on the nodes (M1/M2)
  keyboardMode: 'mindmap',
  surfaceTools: [],
  showsShapeTools: false, // mind maps grow by keyboard (Tab/Enter), not shape drag
  // No right panel: per-node editing lives in the floating contextual toolbar
  // (MindMapOverlay), map-wide actions in the bottom palette — Whimsical-style.
}

const FLOWCHART = {
  type: 'flowchart',
  rendersOwnLayer: true, // FlowchartLayer draws typed nodes + orthogonal edges
  isAutoLayout: false, // manual placement allowed; Tidy reflows (spec B7)
  hasBoundedPaper: true, // bounded with base growth (spec B2)
  handlesSurfaceInteraction: true, // + handles, drag-to-empty, node move
  keyboardMode: 'flowchart',
  surfaceTools: [], // flowchart builds via + handles / keyboard, not bottom tools
  showsShapeTools: false, // flowchart builds via + handles / keyboard
  // No right panel: per-node editing lives in the floating contextual toolbar
  // (FlowchartSelectionEditor); map-wide layout actions in the bottom palette.
}

const WHITEBOARD = {
  type: 'whiteboard',
  rendersOwnLayer: true, // WhiteboardLayer draws strokes + stickies + objects
  isAutoLayout: false,
  hasBoundedPaper: true, // a bounded white canvas/paper, like block
  handlesSurfaceInteraction: true, // pen/highlighter/eraser/sticky/text/laser
  keyboardMode: 'whiteboard',
  // Extra bottom-palette pointer modes (spec C6). The whiteboard carries its full
  // tool set here AND each tool's options live in the bottom palette — there is no
  // whiteboard right panel. Freehand tools (pen/highlighter/eraser/sticky/laser)
  // plus straight lines and a basic table.
  surfaceTools: [
    { tool: 'pen', icon: 'edit-2', label: 'Pen' },
    { tool: 'highlighter', icon: 'edit-3', label: 'Highlighter' },
    { tool: 'eraser', icon: 'delete', label: 'Eraser' },
    { tool: 'text', icon: 'type', label: 'Text' },
    { tool: 'sticky', icon: 'sticky-note', label: 'Sticky note' },
    { tool: 'line', icon: 'minus', label: 'Line' },
    { tool: 'table', icon: 'grid', label: 'Table' },
    { tool: 'laser', icon: 'zap', label: 'Laser pointer' },
  ],
  showsShapeTools: false, // no shape palette on the whiteboard
}

const STRATEGIES = {
  block: BLOCK,
  mindmap: MINDMAP,
  flowchart: FLOWCHART,
  whiteboard: WHITEBOARD,
}

export function getModeStrategy(diagramType) {
  return STRATEGIES[diagramType] || BLOCK
}
