// Pure, browser-free logic for the Writer-style table size picker (#134), split
// out of TableSizePicker.vue so the grid maths and the readout can be unit-tested
// in the node env (CONVENTIONS: keep domain logic browser-free — mirrors
// whiteboardTools.js). Nothing here touches Vue; the .vue file renders it.

import { TABLE_CELL_W, TABLE_CELL_H } from '@/diagram/whiteboardModel.js'

// The grid offers up to 8×8 (issue #134: "support up to ~8×8"). Frappe Writer's
// own picker is 6×8; Draw allows a couple more rows for taller tables.
export const MAX_TABLE_ROWS = 8
export const MAX_TABLE_COLS = 8

// A cell (r, c) is filled when it sits inside the top-left rows×cols block the
// pointer or keyboard currently spans. Coordinates are 1-based, like the v-for
// indices that render the grid.
export function isCellFilled(r, c, rows, cols) {
  return r <= rows && c <= cols
}

// The live "R × C" readout under the grid — rows first, matching the issue and
// Frappe Writer's picker.
export function sizeReadout(rows, cols) {
  return `${rows} × ${cols}`
}

// Clamp a stepped dimension into [1, max] so keyboard nudges never leave the grid.
export function clampDimension(value, max) {
  return Math.max(1, Math.min(max, value))
}

// Top-left origin that centres a rows×cols table in the visible canvas rect, so a
// picker-committed table lands in view without a pointer position — the same
// convention as placeShapesInView and the mind-map / flowchart inserts.
export function tableInsertOrigin(view, rows, cols, cellW = TABLE_CELL_W, cellH = TABLE_CELL_H) {
  return {
    x: view.x + (view.w - cols * cellW) / 2,
    y: view.y + (view.h - rows * cellH) / 2,
  }
}
