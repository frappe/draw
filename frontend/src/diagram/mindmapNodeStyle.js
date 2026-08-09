// Default look-and-feel for a mind-map node (#260). Every node — parent and child
// — defaults to the same monochrome gray box (border + gray fill); colour is
// opt-in per node via the Espresso grid (#274). This reverses #125/#126, where
// children were transparent text and branches were rainbow-coloured. Pure helpers
// so creation (freeFloatingOps), migration (freeFloating), and the store share ONE
// source and stay unit-testable.

import { NODE_GRAY, inkFor } from './espressoPalette.js'

// One style block, applied separately to Parent vs Child in Settings. `border` and
// `fill` are on/off; `curve` is the corner roundness; `align` is the text anchor.
export const DEFAULT_NODE_STYLE = { border: true, fill: true, curve: 'moderate', align: 'center' }

// A node with neither border nor fill renders as transparent text (the old #125
// Whimsical child); any box (border OR fill) makes it "shaped".
export function isShaped(style) {
  return !!(style.border || style.fill)
}

// Corner radius for a node's rect body, from its curve setting. Moderate is the
// default (~8, a rounded rectangle); High is pill-like; None is a sharp box.
export function curveRadius(curve) {
  if (curve === 'none') return 0
  if (curve === 'high') return 20
  return 8 // moderate
}

// Concrete fill / border / ink / shaped for a node built with `style`. `override`
// is an explicit per-node colour (node.color) or null: it colours the border while
// the fill stays gray so the label stays readable. `border` is null when the style
// has border off — the caller renders no stroke.
export function nodeColors(style = DEFAULT_NODE_STYLE, override = null) {
  const fill = style.fill ? NODE_GRAY.fill : 'none'
  const border = style.border ? override || NODE_GRAY.border : null
  const ink = fill === 'none' ? NODE_GRAY.ink : inkFor(fill)
  return { fill, border, ink, shaped: isShaped(style) }
}

// Assemble a node's `border` shape prop from resolved colours. Border-off renders a
// transparent zero-width stroke so geometry (selection, marquee) is unaffected.
export function borderProp(borderColor, width) {
  if (!borderColor) return { color: 'transparent', width: 0, dash: 'solid' }
  return { color: borderColor, width, dash: 'solid' }
}

// Whether a built shape currently carries a visible fill / border. Used to keep the
// `shaped` flag correct as the per-node picker (#274) toggles a colour to "None": a
// node stays boxed while it still has either, and becomes transparent text with
// neither.
export function hasFill(shape) {
  return !!(shape?.fill && shape.fill !== 'none')
}
export function hasBorder(shape) {
  const b = shape?.border
  return !!(b && b.color !== 'transparent' && (b.width ?? 0) > 0)
}

// A branch line follows its child node's border colour (#272): gray by default,
// the child's override when set.
export const CONNECTOR_GRAY = NODE_GRAY.border
export function connectorColor(override = null) {
  return override || CONNECTOR_GRAY
}
