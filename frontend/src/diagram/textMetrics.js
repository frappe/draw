// Pure text metrics shared by the auto-layout engines. No DOM measurement, so
// mind-map and flowchart node sizing stays deterministic and unit-testable —
// both need "how tall will this text be once it wraps?" and must answer it the
// same way, or their boxes clip text the other's wouldn't.

// Greedy word-wrap line count for a box `perLine` characters wide: packs whole
// words per line, and breaks a single word too long to fit across lines. This
// approximates how the rendered wrapping <div> lays the same text out, so a box
// measured from it leaves room for every line.
export function wrapLineCount(text, perLine) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  let lines = 1
  let col = 0
  for (const word of words) {
    if (word.length > perLine) {
      if (col > 0) lines++ // finish the current line before the long word
      lines += Math.ceil(word.length / perLine) - 1
      col = word.length % perLine || perLine
      continue
    }
    const need = col === 0 ? word.length : col + 1 + word.length
    if (need <= perLine) col = need
    else {
      lines++
      col = word.length
    }
  }
  return lines
}

// The same greedy wrap, returning the lines themselves. The exporter needs the
// text of each line (SVG has no wrapping <text>), while the layout engines only
// ever needed how many there would be.
export function wrapLines(text, perLine) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (!words.length) return ['']
  const lines = []
  let line = ''
  for (const word of words) {
    for (const part of splitLongWord(word, perLine)) {
      if (!line) line = part
      else if (line.length + 1 + part.length <= perLine) line += ` ${part}`
      else {
        lines.push(line)
        line = part
      }
    }
  }
  lines.push(line)
  return lines
}

// A word too long for one line is cut into full-width pieces, the way the renderer
// breaks it (`word-break: break-word`).
function splitLongWord(word, perLine) {
  if (word.length <= perLine) return [word]
  const parts = []
  for (let at = 0; at < word.length; at += perLine) parts.push(word.slice(at, at + perLine))
  return parts
}

// Characters that fit across a box `textWidth` px wide at `charWidth` px each.
// At least one, so a box narrower than a single character still wraps instead of
// dividing by zero.
export function charsPerLine(textWidth, charWidth) {
  return Math.max(1, Math.floor(textWidth / charWidth))
}

// --- measured metrics, for text that does NOT wrap ---------------------------
//
// The two above answer "how tall once it wraps?" for a box of a known width. A
// canvas text element (#418) is the other way round: the text is fixed and the box
// follows it, so what is needed is the real width of the string.
//
// It cannot be measured off the live editor. That field is laid out INSIDE the box
// being sized, so its `scrollWidth` is bounded by the number it is meant to
// produce, and ProseMirror's own `white-space: pre-wrap` wraps anything longer —
// together they drove the width down to the padding and the height into the
// hundreds. Measuring the string against the font is independent of whatever box
// it currently sits in. A 2D context is used purely as a ruler; nothing is drawn.

let ruler = null

function measuringContext() {
  if (ruler) return ruler
  if (typeof document === 'undefined') return null
  ruler = document.createElement('canvas').getContext('2d')
  return ruler
}

// The CSS `font` shorthand for a text style. Order matters to the parser: style,
// weight, size, family.
function fontOf(style = {}) {
  const size = style.size || 16
  const family = style.font || 'Inter, sans-serif'
  return `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 500} ${size}px ${family}`
}

// The width of the widest line in `content` at `style`. Zero for empty text and in
// a browser-free environment, so callers fall back to their own minimum rather
// than to NaN.
export function textWidth(content, style = {}) {
  const context = measuringContext()
  if (!context || !content) return 0
  context.font = fontOf(style)
  return String(content)
    .split('\n')
    .reduce((widest, line) => Math.max(widest, context.measureText(line).width), 0)
}

// How many lines `content` occupies when nothing wraps it — at least one, so an
// empty element keeps a line's height instead of collapsing.
export function lineCount(content) {
  if (!content) return 1
  return String(content).split('\n').length
}
