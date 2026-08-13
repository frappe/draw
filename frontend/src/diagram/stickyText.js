// Sticky note text rules (#416): what Enter does inside a note, and how tall the
// note has to be to hold what was typed. Pure, so both are unit-testable — the
// component only applies the answers to the DOM.
//
// A note stores one plain string. The browser does not edit plain strings: Enter in
// a contentEditable builds <div>/<br> structure whatever the CSS says, and reading
// the field back with `textContent` drops exactly those breaks, which is how three
// typed lines were saved as one. The fix is on the reading side (`innerText`, which
// reflects the line breaks as rendered), so the browser is left to insert text the
// way it wants to and only list continuation is intercepted here.

import { charsPerLine, wrapLines } from './textMetrics.js'

// A "- " list item with something in it, and the same marker with nothing after it.
const FILLED_ITEM = /^(\s*)-\s+\S/
const EMPTY_ITEM = /^(\s*)-\s*$/

// What Enter should do, given the text of the line the caret sits on: how much to
// take back before the caret, and what to put in.
//
// Every Enter is answered here rather than left to the browser. The browser's own
// line break is only as good as the key event that triggers it — one dispatched
// without a raw key code reaches the page but inserts nothing — so the note would
// gain lines from a real keyboard and none from anything else.
//
// Typing "- first" and pressing Enter offers "- " again rather than making the user
// retype the marker. Enter on a marker with nothing after it ends the list instead,
// the escape every list editor gives — without it a list could never be finished.
export function newlineIntent(line) {
  if (EMPTY_ITEM.test(line)) return { deleteBefore: line.length, insert: '' }
  const item = FILLED_ITEM.exec(line)
  return { deleteBefore: 0, insert: item ? `\n${item[1]}- ` : '\n' }
}

// A pasted string, reduced to what a note can hold: text with normalized breaks.
export function plainPaste(pasted) {
  return String(pasted ?? '').replace(/\r\n?/g, '\n')
}

// The height this text needs at `width`, matching what the note renders. Same
// heuristic as a mind-map node: hard line breaks are counted as their own lines,
// then each is wrapped at the width the box actually offers. Deterministic (no DOM
// measurement), so a note grows to the same size on every machine.
export const STICKY_PAD_X = 24
export const STICKY_PAD_Y = 24
// The note renders its text at this size; the measurement below and the field's
// CSS both read it here so a note is never sized against a font it does not use.
export const STICKY_FONT_SIZE = 15
export const STICKY_LINE_HEIGHT = 1.35
const CHAR_WIDTH_RATIO = 0.55 // Inter's average advance, relative to the font size

export function stickyTextHeight(text, { width, fontSize = STICKY_FONT_SIZE }) {
  const lines = stickyLines(text, width, fontSize).length
  return Math.ceil(lines * fontSize * STICKY_LINE_HEIGHT + STICKY_PAD_Y)
}

// The note's text as the lines it is drawn on: hard breaks first, then the wrap the
// field applies at this width. The export (SVG has no wrapping text element) and
// the height above read the same answer, so a note that fits on the canvas fits in
// the exported image.
export function stickyLines(text, width, fontSize = STICKY_FONT_SIZE) {
  const perLine = charsPerLine(width - STICKY_PAD_X, fontSize * CHAR_WIDTH_RATIO)
  return String(text || '')
    .split(/\r?\n/)
    .flatMap((line) => wrapLines(line, perLine))
}
