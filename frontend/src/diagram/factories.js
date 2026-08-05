// Factories for shapes and connectors. They assign stable ids — a process-local
// counter, never a Date and never a per-id Math.random (CONVENTIONS); the only
// randomness is one short per-session salt, see CLIENT_SALT below — and fill
// defaults: geometry plus the active theme's primary triad (border + text ink),
// so every shape is beautiful by default. New shapes are outline-only — see
// styleForType.

import { primaryTriad, CONNECTOR_DEFAULT_STYLE } from './theme.js'

let idCounter = 0
// A short per-session salt so two collaborators never mint the same id (they'd
// collide in the shared Yjs maps). Ids stay short + stable within a session.
const CLIENT_SALT = Math.random().toString(36).slice(2, 5)

// Short, unique ids. Prefix keeps shapes/connectors/nodes distinguishable; the
// salt makes them unique across concurrent clients (exported so the mind-map
// model reuses one id source).
export function nextId(prefix) {
  idCounter += 1
  return `${prefix}${CLIENT_SALT}${idCounter.toString(36)}`
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

// Text boxes and images render with no fill and no border (spec §5.1). Every
// other shape spawns outline-only — a themed border, transparent fill — so a
// new shape never hides what it is drawn over; the user adds a fill afterwards
// from the right palette (spec §5.1).
function styleForType(type, triad) {
  if (type === 'text' || type === 'image') {
    return { fill: 'none', border: { color: 'none', width: 0, dash: 'solid' } }
  }
  return { fill: 'none', border: { color: triad.stroke, width: 1.5, dash: 'solid' } }
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
    flipX: false,
    flipY: false,
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
    // Endpoint styles per end: 'none' | 'arrow' | 'open-arrow' | 'circle' |
    // 'square' | 'diamond' (legacy booleans are normalised on render).
    arrowheads: partial.arrowheads || { start: 'none', end: 'arrow' },
    style: { ...CONNECTOR_DEFAULT_STYLE },
    label: '',
    ...partial,
  }
}
