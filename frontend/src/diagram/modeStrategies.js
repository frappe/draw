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
  // NO surfaceTools here on purpose. The whiteboard's tool set lives in
  // WhiteboardTools.vue, which BottomPalette renders for whiteboard and unified
  // documents; the palette's `surfaceTools` branch is a `v-else-if` after it, so
  // anything declared here would never render. A duplicate list did sit here, with
  // icons that had drifted from the ones actually shown (pen as 'edit-2' vs the real
  // 'pen-line'), which is misleading rather than harmless — it reads as the
  // authoritative tool set. The seam stays available for a future type that has no
  // component of its own.
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
