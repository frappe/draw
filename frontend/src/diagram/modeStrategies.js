// Mode strategies (spec diagram-types Part G1). One shared editor; the strategy
// for the diagram's `diagramType` declares how that type behaves so the canvas,
// palettes and interactions can branch without forking the editor. M1 only needs
// the rendering + auto-layout flags; palette/keyboard fields are filled by M2+.

const BLOCK = {
  type: 'block',
  rendersOwnLayer: false, // uses the shared shape/connector render path
  isAutoLayout: false,
  hasBoundedPaper: true,
}

const MINDMAP = {
  type: 'mindmap',
  rendersOwnLayer: true, // MindMapNodeLayer draws the laid-out tree
  isAutoLayout: true, // positions are computed; the user never free-places nodes
  hasBoundedPaper: false, // freely auto-expanding canvas (spec A2)
}

const STRATEGIES = {
  block: BLOCK,
  mindmap: MINDMAP,
  // flowchart / whiteboard are added in their own build steps.
}

export function getModeStrategy(diagramType) {
  return STRATEGIES[diagramType] || BLOCK
}
