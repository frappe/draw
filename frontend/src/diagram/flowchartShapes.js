// Per-type SVG geometry for flowchart nodes (spec diagram-types B3). Pure: given
// a node's box size, return the SVG element kind + attributes so FlowchartLayer
// renders one <path>/<rect>/<ellipse>/<polygon> per type. Keeps the layer's
// template small and makes shape geometry unit-testable. Coordinates are local
// to the node group (0,0 at the node's top-left), drawn in canvas units (G4).

// Horizontal skew of the Input/Output parallelogram, and the width of the side
// bars on a Predefined process. Both are capped as a FRACTION of the box as well
// as in px (#441 item 2). A flat px constant is right at canvas size and
// catastrophic at icon size: ShapeGlyph draws these same shapes into a 24×24 box,
// where an 18px skew on an 18px-wide shape collapsed the parallelogram onto its
// own diagonal — the picker offered Input / Output as a bare slash. The fraction
// only binds below ~100px, so every on-canvas node is pixel-identical to before.
// Exported because the Parallelogram BLOCK shape (#470) takes the same slant. The
// angle is stated once here; only the px cap below is a flowchart-node concern.
export const SKEW_RATIO = 0.18
const SKEW_MAX = 18
export const BAR_RATIO = 0.12
export const BAR_MAX = 10

export function skewOf(w) {
  return Math.min(SKEW_MAX, w * SKEW_RATIO)
}

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
  const skew = skewOf(w)
  return `${round(skew)},0 ${w},0 ${round(w - skew)},${h} 0,${h}`
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

// Database: cylinder — silhouette (top rim arc + sides + bottom curve) plus the
// BACK half of the top ellipse as a second subpath, which is what makes it read as
// a cylinder rather than a lozenge (#441 item 2). The rim subpath carries the same
// fill as the body, so it only ever shows as the stroked ellipse line.
function databasePath(w, h) {
  const ry = round(h * 0.16)
  const body = `M0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry} V ${h - ry} A ${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`
  const rim = `M0 ${ry} A ${w / 2} ${ry} 0 0 0 ${w} ${ry}`
  return `${body} ${rim}`
}

// Predefined process: rectangle with a vertical bar inset on each side.
function predefinedPath(w, h) {
  const bar = round(Math.min(BAR_MAX, w * BAR_RATIO))
  return `M0 0 H${w} V${h} H0 Z M${bar} 0 V${h} M${w - bar} 0 V${h}`
}

function round(n) {
  return Math.round(n)
}
