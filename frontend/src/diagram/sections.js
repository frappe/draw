// Named sections/frames (spec: available in EVERY diagram type). A section is a
// document-level object (like shapes/connectors) — a titled rectangle that groups
// content. It renders behind everything and never owns the content inside it; it's
// purely a visual grouping you can move, resize, rename and delete.

import { nextId } from './factories.js'

export const SECTION_HEADER_H = 26

export function makeSection(x, y, w, h, partial = {}) {
  return {
    id: nextId('sec'),
    x,
    y,
    w: Math.max(120, w),
    h: Math.max(80, h),
    title: partial.title || 'Section',
    color: partial.color || '#6E56CF',
  }
}
