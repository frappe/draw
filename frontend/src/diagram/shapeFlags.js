// Lock / hide flags on shapes (spec 7.4). Hidden shapes are not rendered and
// never hit-tested; locked shapes render normally but can't be grabbed, moved,
// resized, marquee-selected, or bulk-selected — they're unlocked via right-click.
// These tiny predicates keep the rule identical across every interaction path.

export function isHidden(shape) {
  return !!shape?.hidden
}

export function isLocked(shape) {
  return !!shape?.locked
}

// Shown on the canvas (everything except explicitly hidden).
export function isVisible(shape) {
  return !isHidden(shape)
}

// Eligible for pointer selection / move / resize: visible and unlocked.
export function isInteractable(shape) {
  return !!shape && !shape.hidden && !shape.locked
}
