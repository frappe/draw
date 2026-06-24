// Per-type SVG geometry for flowchart nodes (spec diagram-types B3). Pure: given
// a node's box size, return the SVG element kind + attributes so FlowchartLayer
// renders one <path>/<rect>/<ellipse>/<polygon> per type. Keeps the layer's
// template small and makes shape geometry unit-testable. Coordinates are local
// to the node group (0,0 at the node's top-left), drawn in canvas units (G4).

const PARALLELOGRAM_SKEW = 18 // px horizontal skew for the Input/Output shape

// Describe the shape for a node type at a given width/height. Returns one of:
//   { kind:'rect', rx } | { kind:'ellipse' } | { kind:'polygon', points }
export function nodeShape(nodeType, w, h) {
  switch (nodeType) {
    case 'terminator':
      return { kind: 'rect', rx: h / 2 } // stadium / pill
    case 'decision':
      return { kind: 'polygon', points: diamondPoints(w, h) }
    case 'inputOutput':
      return { kind: 'polygon', points: parallelogramPoints(w, h) }
    case 'connector':
      return { kind: 'ellipse' } // small circle / junction
    case 'process':
    default:
      return { kind: 'rect', rx: 6 }
  }
}

function diamondPoints(w, h) {
  return `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`
}

function parallelogramPoints(w, h) {
  return `${PARALLELOGRAM_SKEW},0 ${w},0 ${w - PARALLELOGRAM_SKEW},${h} 0,${h}`
}
