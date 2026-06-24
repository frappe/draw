// Factories for shapes and connectors. They assign stable ids (a process-local
// counter, NOT Math.random/Date per CONVENTIONS) and fill defaults — geometry
// plus the active theme's primary triad so every shape is beautiful by default.

import { primaryTriad, CONNECTOR_DEFAULT_STYLE } from './theme.js'

let idCounter = 0

// Short, unique, monotonic ids. Prefix keeps shapes/connectors/nodes
// distinguishable (exported so the mind-map model reuses one id source).
export function nextId(prefix) {
  idCounter += 1
  return `${prefix}${idCounter.toString(36)}`
}

const DEFAULT_SHAPE_SIZE = { w: 180, h: 96 }

function defaultText(color) {
  return {
    content: '',
    align: 'center',
    valign: 'middle',
    style: { size: 16, bold: false, italic: false, underline: false, color },
  }
}

// A text box renders with no fill and no border (spec §5.1).
function styleForType(type, triad) {
  if (type === 'text') {
    return { fill: 'none', border: { color: 'none', width: 0, dash: 'solid' } }
  }
  return { fill: triad.fill, border: { color: triad.stroke, width: 1.5, dash: 'solid' } }
}

export function createShape(partial = {}, themePreset) {
  const type = partial.type || 'rectangle'
  const triad = primaryTriad(themePreset)
  const style = styleForType(type, triad)
  return {
    id: nextId('s'),
    type,
    x: 0,
    y: 0,
    ...DEFAULT_SHAPE_SIZE,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: style.fill,
    border: style.border,
    text: defaultText(triad.ink),
    ...partial,
  }
}

export function createConnector(partial = {}) {
  return {
    id: nextId('c'),
    type: partial.type || 'straight',
    from: partial.from || { x: 0, y: 0 },
    to: partial.to || { x: 0, y: 0 },
    arrowheads: { start: false, end: true },
    style: { ...CONNECTOR_DEFAULT_STYLE },
    label: '',
    ...partial,
  }
}
