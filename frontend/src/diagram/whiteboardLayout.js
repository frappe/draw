// Whiteboard content bounds — pure helper the canvas uses to frame the board for
// fit-to-view / thumbnail / export (Part G8). The whiteboard surface is freely
// auto-expanding (spec C2), so content has no fixed paper; this unions stroke
// points, sticky-note rects and shared shapes into one box. The laser trail is
// transient and never contributes (spec C10). Refined by the W-step agent.

import { axisAlignedBBox } from './geometry.js'

const PAD = 80
const FALLBACK = { w: 800, h: 600 }

export function whiteboardContentBounds(model, shapes = []) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  unionStrokes(box, model)
  unionStickies(box, model)
  unionShapes(box, shapes)
  // Empty board: center the fallback box on the canvas centre (1280×720 default)
  // so fit-to-view frames the same point as the empty-state hint (spec C8).
  if (box.minX === Infinity) {
    return { x: 640 - FALLBACK.w / 2, y: 360 - FALLBACK.h / 2, w: FALLBACK.w, h: FALLBACK.h }
  }
  return {
    x: box.minX - PAD,
    y: box.minY - PAD,
    w: box.maxX - box.minX + PAD * 2,
    h: box.maxY - box.minY + PAD * 2,
  }
}

function expand(box, x, y) {
  box.minX = Math.min(box.minX, x)
  box.minY = Math.min(box.minY, y)
  box.maxX = Math.max(box.maxX, x)
  box.maxY = Math.max(box.maxY, y)
}

function unionStrokes(box, model) {
  for (const stroke of model?.strokes || []) {
    for (const point of stroke.points) expand(box, point.x, point.y)
  }
}

function unionStickies(box, model) {
  for (const note of model?.stickyNotes || []) {
    expand(box, note.x, note.y)
    expand(box, note.x + note.w, note.y + note.h)
  }
}

function unionShapes(box, shapes) {
  for (const shape of shapes) {
    const rect = axisAlignedBBox(shape)
    expand(box, rect.x, rect.y)
    expand(box, rect.x + rect.w, rect.y + rect.h)
  }
}
