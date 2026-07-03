// Per-type SVG geometry for flowchart nodes (spec diagram-types B3). Pure: given
// a node's box size, return the SVG element kind + attributes so FlowchartLayer
// renders one <path>/<rect>/<ellipse>/<polygon> per type. Keeps the layer's
// template small and makes shape geometry unit-testable. Coordinates are local
// to the node group (0,0 at the node's top-left), drawn in canvas units (G4).

const PARALLELOGRAM_SKEW = 18 // px horizontal skew for the Input/Output shape

// Describe the shape for a node type at a given width/height. Returns one of:
//   { kind:'rect', rx } | { kind:'ellipse' } | { kind:'polygon', points } |
//   { kind:'path', d }
export function nodeShape(nodeType, w, h) {
  switch (nodeType) {
    case 'terminator':
      return { kind: 'rect', rx: h / 2 } // stadium / pill
    case 'decision':
      return { kind: 'polygon', points: diamondPoints(w, h) }
    case 'inputOutput':
      return { kind: 'polygon', points: parallelogramPoints(w, h) }
    case 'manualInput':
      return { kind: 'polygon', points: manualInputPoints(w, h) } // sloped top edge
    case 'preparation':
      return { kind: 'polygon', points: hexagonPoints(w, h) }
    case 'offPageRef':
      return { kind: 'polygon', points: offPagePoints(w, h) } // home-plate pentagon
    case 'document':
      return { kind: 'path', d: documentPath(w, h) } // wavy bottom edge
    case 'database':
      return { kind: 'path', d: databasePath(w, h) } // cylinder
    case 'predefinedProcess':
      return { kind: 'path', d: predefinedPath(w, h) } // rect + side bars
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

// Manual input: rectangle with a top edge sloping up to the right.
function manualInputPoints(w, h) {
  return `0,${round(h * 0.28)} ${w},0 ${w},${h} 0,${h}`
}

// Preparation: elongated hexagon (pointed left + right).
function hexagonPoints(w, h) {
  const cut = round(w * 0.16)
  return `${cut},0 ${w - cut},0 ${w},${h / 2} ${w - cut},${h} ${cut},${h} 0,${h / 2}`
}

// Off-page reference: pentagon / home-plate pointing down.
function offPagePoints(w, h) {
  const shoulder = round(h * 0.62)
  return `0,0 ${w},0 ${w},${shoulder} ${w / 2},${h} 0,${shoulder}`
}

// Document: rectangle whose bottom edge is a shallow wave.
function documentPath(w, h) {
  const base = round(h * 0.82)
  return `M0 0 H${w} V${base} Q${round(w * 0.75)} ${round(h * 0.7)} ${round(w * 0.5)} ${base} Q${round(w * 0.25)} ${h} 0 ${base} Z`
}

// Database: cylinder — front rim + body + bottom curve (filled body).
function databasePath(w, h) {
  const ry = round(h * 0.16)
  return `M0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry} V ${h - ry} A ${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`
}

// Predefined process: rectangle with a vertical bar inset on each side.
function predefinedPath(w, h) {
  const bar = 10
  return `M0 0 H${w} V${h} H0 Z M${bar} 0 V${h} M${w - bar} 0 V${h}`
}

function round(n) {
  return Math.round(n)
}
