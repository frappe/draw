// Which shapes can carry a label (#519).
//
// It cannot be answered by looking for a `text` block: createShape gives EVERY
// shape one, images included, so an image reports a font of Inter and a size of 16
// it has no way to use. The answer is the shape TYPE, and there is exactly one type
// that is its own content rather than a container for some — an image. Every other
// type in the catalogue is an outline a label sits inside, and a text element is a
// label with nothing else to it.

export function canHoldText(shape) {
  return Boolean(shape) && shape.type !== 'image'
}
