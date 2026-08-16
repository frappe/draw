// The block arrow's two adjustable proportions (#469) and the outline they make.
//
// Both are fractions of the shape's box, like every other preset outline, so an
// adjusted arrow keeps its proportions through a resize.
//
// They are stored as two FLAT numbers on the shape, `arrowShaft` and `arrowHead`,
// following `cornerRadius` — the precedent for "a shape parameter a handle sets".
// A nested `shape.arrow = { shaft, head }` reads better but fights the gesture
// machinery in useShapeTransform, which Object.assigns patches onto the shape and
// compares values with !==: the assign would drop whichever key the drag did not
// set, and the comparison would see two different objects every time and commit a
// history step for a drag that moved nothing.

// Half the shaft's thickness, as a fraction of the box height. The shaft runs from
// `shaft` to `1 - shaft`, symmetrical about the centre line.
export const DEFAULT_ARROW_SHAFT = 0.3
// Where the head's shoulder sits along the box. The head runs from there to the tip
// at the right edge.
export const DEFAULT_ARROW_HEAD = 0.62

// The shaft must stay visibly thick and must never reach the centre line, where the
// two halves would meet and the shaft would close up.
const SHAFT_MIN = 0.05
const SHAFT_MAX = 0.45
// The head must leave some shaft behind it and must not collapse into the tip.
const HEAD_MIN = 0.15
const HEAD_MAX = 0.9

// A shape's own values when it carries usable ones, else the type defaults — the
// same rule shapeCornerRadius uses, so an arrow nobody has touched keeps the stock
// look and a persisted document cannot put an unusable number into the outline.
export function arrowProportions(shape) {
  return {
    shaft: clampArrowShaft(shape?.arrowShaft),
    head: clampArrowHead(shape?.arrowHead),
  }
}

export function clampArrowShaft(value) {
  return clampOr(value, DEFAULT_ARROW_SHAFT, SHAFT_MIN, SHAFT_MAX)
}

export function clampArrowHead(value) {
  return clampOr(value, DEFAULT_ARROW_HEAD, HEAD_MIN, HEAD_MAX)
}

// The outline, normalised 0..1 on the box.
//
// The head spans the FULL height (#466). It used to run 0.05 to 0.95, so the shape
// left a 5% gap at the top and bottom of its own bounding box and the selection box
// never sat tight on it — while the sides, which run 0 to 1, looked correct. Its
// neighbours pentagon and hexagon both run 0 to 1, and Google Slides draws the head
// across the full height too.
export function arrowOutline(shape) {
  const { shaft, head } = arrowProportions(shape)
  return [
    [0, shaft],
    [head, shaft],
    [head, 0],
    [1, 0.5],
    [head, 1],
    [head, 1 - shaft],
    [0, 1 - shaft],
  ]
}

function clampOr(value, fallback, min, max) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}
