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

// Characters that fit across a box `textWidth` px wide at `charWidth` px each.
// At least one, so a box narrower than a single character still wraps instead of
// dividing by zero.
export function charsPerLine(textWidth, charWidth) {
  return Math.max(1, Math.floor(textWidth / charWidth))
}
