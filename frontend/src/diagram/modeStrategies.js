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

const BLOCK = {
  type: 'block',
  rendersOwnLayer: false, // uses the shared shape/connector render path
  isAutoLayout: false,
  hasBoundedPaper: true,
  handlesSurfaceInteraction: false,
  keyboardMode: 'block',
  showsShapeTools: true, // left creation palette (shapes/connectors/icons)
  // No right panel: shape editing lives in the floating contextual toolbar
  // creation and canvas settings all live on the canvas toolbar.
}

const MINDMAP = {
  type: 'mindmap',
  rendersOwnLayer: true, // MindMapNodeLayer draws the laid-out tree
  isAutoLayout: true, // positions are computed; the user never free-places nodes
  hasBoundedPaper: false, // freely auto-expanding canvas (spec A2)
  handlesSurfaceInteraction: false, // node interactions live on the nodes (M1/M2)
  keyboardMode: 'mindmap',
  showsShapeTools: false, // mind maps grow by keyboard (Tab/Enter), not shape drag
  // No right panel: per-node editing lives in the floating contextual toolbar
  // and map-wide actions both live on the canvas toolbar.
}

const FLOWCHART = {
  type: 'flowchart',
  rendersOwnLayer: true, // FlowchartLayer draws typed nodes + orthogonal edges
  isAutoLayout: false, // manual placement allowed; Tidy reflows (spec B7)
  hasBoundedPaper: true, // bounded with base growth (spec B2)
  handlesSurfaceInteraction: true, // + handles, drag-to-empty, node move
  keyboardMode: 'flowchart',
  showsShapeTools: false, // flowchart builds via + handles / keyboard
  // No right panel: per-node editing lives in the floating contextual toolbar
  // and map-wide layout actions both live on the canvas toolbar.
}

const WHITEBOARD = {
  type: 'whiteboard',
  rendersOwnLayer: true, // WhiteboardLayer draws strokes + stickies + objects
  isAutoLayout: false,
  hasBoundedPaper: true, // a bounded white canvas/paper, like block
  handlesSurfaceInteraction: true, // pen/highlighter/eraser/sticky/text/laser
  keyboardMode: 'whiteboard',
  // The whiteboard's tool set is NOT declared here. It lives in
  // floating/whiteboardTools.js, which WhiteboardTools.vue renders onto the
  // canvas toolbar. A duplicate list did sit here once, with icons that had
  // drifted from the ones actually shown (pen as 'edit-2' against the real
  // 'pen-line') — misleading rather than harmless, because it read as the
  // authoritative set. One list, one place.
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
