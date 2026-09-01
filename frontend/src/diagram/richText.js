// Inline formatting for a whiteboard table cell (#344).
//
// A cell's text stays a plain string in `table.cells`. When part of it carries
// formatting, `table.cellRuns` holds that same text split into runs — a run
// being a slice that shares one set of marks. Keeping the plain string
// authoritative means anything that only wants the text (search, an older
// client, the empty-cell check) reads a cell exactly as before; only the
// formatting is lost. `runsToText` is what keeps the two in step.
//
// A mark is tri-state on purpose: `true`, `false`, or absent. Absent means
// "inherit", which is what lets a header-row cell bold itself by default while
// still allowing one cell to be explicitly un-bolded (#344 header rule).

// `strike` joined the three in #508, so a table cell offers the same four marks
// a text box does. It is a mark rather than a per-object flag on purpose: part of a
// cell can be struck through, which is the whole reason cells hold runs.
export const MARKS = ['bold', 'italic', 'underline', 'strike']

// Any stored cell value — a plain string, an array of runs, or junk from an
// untrusted document — as a clean run list. Malformed runs are dropped rather
// than thrown on, matching how the rest of whiteboardModel treats bad input.
export function toRuns(value) {
  if (typeof value === 'string') return value ? [{ text: value }] : []
  if (!Array.isArray(value)) return []
  return value.filter((run) => run && typeof run.text === 'string' && run.text).map(cleanRun)
}

export function runsToText(runs) {
  return toRuns(runs)
    .map((run) => run.text)
    .join('')
}

// True when any run carries a mark, i.e. the cell needs `cellRuns` at all. A
// cell without one stays representable by its plain string alone.
export function hasFormatting(runs) {
  return toRuns(runs).some((run) => MARKS.some((mark) => run[mark] !== undefined))
}

// Drops empty runs and merges neighbours that share every mark, so repeated
// edits can't grow a cell into a long chain of single-character runs.
export function normalizeRuns(runs) {
  const out = []
  for (const run of toRuns(runs)) {
    const last = out[out.length - 1]
    if (last && sameMarks(last, run)) last.text += run.text
    else out.push({ ...run })
  }
  return out
}

// Sets `mark` over the half-open text range [start, end), splitting runs at the
// boundaries. A `value` of undefined clears the mark back to inherited.
export function applyMark(runs, start, end, mark, value) {
  const clean = toRuns(runs)
  if (end <= start) return normalizeRuns(clean)
  const out = []
  let at = 0
  for (const run of clean) {
    const runEnd = at + run.text.length
    const from = clamp(start, at, runEnd)
    const to = clamp(end, at, runEnd)
    if (from > at) out.push({ ...run, text: run.text.slice(0, from - at) })
    if (to > from) out.push(withMark(run, run.text.slice(from - at, to - at), mark, value))
    if (runEnd > to) out.push({ ...run, text: run.text.slice(to - at) })
    at = runEnd
  }
  return normalizeRuns(out)
}

// What the toolbar should show for [start, end): `true`, `false`, `undefined`
// (nothing said) or 'mixed'. A collapsed caret reports the run it sits after,
// so the button reflects what the next typed character would get.
export function markState(runs, start, end, mark) {
  const values = markValuesIn(toRuns(runs), start, end, mark)
  if (!values.length) return undefined
  return values.every((value) => value === values[0]) ? values[0] : 'mixed'
}

// A mark's effective value once inheritance is applied — a header-row cell
// passes `inherited: true` for bold.
export function resolveMark(run, mark, inherited = false) {
  return run[mark] === undefined ? inherited : run[mark] === true
}

// The runs covering the half-open text range [start, end).
export function sliceRuns(runs, start, end) {
  const out = []
  let at = 0
  for (const run of toRuns(runs)) {
    const runEnd = at + run.text.length
    const from = clamp(start, at, runEnd)
    const to = clamp(end, at, runEnd)
    if (to > from) out.push({ ...run, text: run.text.slice(from - at, to - at) })
    at = runEnd
  }
  return normalizeRuns(out)
}

// Drops surrounding whitespace, keeping the marks on what is left — the run
// equivalent of the trim the plain-text cell editor did on commit.
export function trimRuns(runs) {
  const clean = normalizeRuns(runs)
  const text = runsToText(clean)
  return sliceRuns(clean, text.length - text.trimStart().length, text.trimEnd().length)
}

// Replaces [start, end) with plain text, which takes on the marks already in
// force at `start` — so typing or pasting inside bold text stays bold.
export function replaceRange(runs, start, end, text) {
  const clean = normalizeRuns(runs)
  const length = runsToText(clean).length
  const inserted = text ? [{ ...marksAt(clean, start), text }] : []
  return normalizeRuns([...sliceRuns(clean, 0, start), ...inserted, ...sliceRuns(clean, end, length)])
}

export function runsEqual(a, b) {
  const left = normalizeRuns(a)
  const right = normalizeRuns(b)
  return left.length === right.length && left.every((run, i) => run.text === right[i].text && sameMarks(run, right[i]))
}

// The marks in force at a caret position — those of the run it sits after.
function marksAt(runs, offset) {
  const out = {}
  let at = 0
  for (const run of runs) {
    const runEnd = at + run.text.length
    if (at < offset && runEnd >= offset) {
      for (const mark of MARKS) {
        if (run[mark] !== undefined) out[mark] = run[mark]
      }
      return out
    }
    at = runEnd
  }
  return out
}

function cleanRun(run) {
  const out = { text: run.text }
  for (const mark of MARKS) {
    if (typeof run[mark] === 'boolean') out[mark] = run[mark]
  }
  return out
}

function sameMarks(a, b) {
  return MARKS.every((mark) => a[mark] === b[mark])
}

function withMark(run, text, mark, value) {
  const out = { ...run, text }
  if (value === undefined) delete out[mark]
  else out[mark] = value
  return out
}

function markValuesIn(runs, start, end, mark) {
  const out = []
  let at = 0
  for (const run of runs) {
    const runEnd = at + run.text.length
    // A collapsed caret belongs to the run that ends at it, not the one starting there.
    const overlaps = end > start ? runEnd > start && at < end : at < start && runEnd >= start
    if (overlaps) out.push(run[mark])
    at = runEnd
  }
  return out
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high)
}

// Greedy word-wrap at `perLine` characters, per RUN instead of a plain string,
// so a wrapped table cell keeps its bold/italic/underline/strike marks on the
// right characters after it splits across lines (#556). This is the ONE wrap
// tableStructure.js sizes cells with (wrappedCellLines) as well as the one the
// canvas render and export use (wrappedCellRunLines) — a plain string just goes
// in as a single run — so a row grown for a cell always agrees with how many
// lines that cell is drawn with (#557). Kept here rather than in textMetrics.js
// because it needs the mark algebra (sameMarks, MARKS) that file deliberately
// has none of.
//
// Operates on individual characters rather than whole runs so a word made of
// several runs (bold "CELL-" next to plain "TEXT") still wraps as one word: a
// flat per-character mark list survives a mid-word run boundary in a way that
// packing whole runs as units could not.
export function wrapRuns(runs, perLine) {
  const chars = toRuns(runs).flatMap((run) => {
    const { text, ...marks } = run
    return [...text].map((ch) => ({ ch, marks }))
  })
  const hardLines = splitCharsOnBreaks(chars)
  return hardLines.flatMap((line) => wrapCharLine(line, perLine))
}

function splitCharsOnBreaks(chars) {
  const lines = [[]]
  for (const c of chars) {
    if (c.ch === '\n') lines.push([])
    else lines[lines.length - 1].push(c)
  }
  return lines
}

// One hard line's characters, greedily packed into lines of at most `perLine`
// characters.
//
// Tokenised into words and the ORIGINAL whitespace characters BETWEEN them,
// kept apart rather than reconstructed: a plain-string wrap can get away with
// re-joining words on a fresh single space because nothing downstream cares
// which run a space belongs to, but here the space itself carries a mark (bold
// text has a bold space in the middle of it) — dropping and reinserting it
// would silently hand that character whichever neighbour's mark happened to
// run the reconstruction, moving a bold/underline boundary by one character.
// Reconstruction would also cost a run of N whitespace characters only ONE
// column instead of N — this is the divergence #557 fixed by moving
// wrappedCellLines onto this same per-character tokenizer. A wrapped line may
// end with a trailing space (the one that caused the wrap) rather than
// trimming it — invisible either way, under `white-space: pre-wrap` and in the
// SVG export alike.
function wrapCharLine(chars, perLine) {
  const tokens = []
  let word = []
  for (const c of chars) {
    if (/\s/.test(c.ch)) {
      if (word.length) {
        tokens.push(word)
        word = []
      }
      tokens.push(c)
    } else word.push(c)
  }
  if (word.length) tokens.push(word)
  if (!tokens.length) return [[]]

  const lines = []
  let line = []
  let col = 0
  for (const token of tokens) {
    const isSpace = !Array.isArray(token)
    if (isSpace) {
      // A wrapped line never starts with the space that caused the wrap —
      // same as wrapLines' own words.filter(Boolean) dropping it.
      if (col === 0) continue
      if (col + 1 > perLine) {
        lines.push(line)
        line = []
        col = 0
        continue
      }
      line = [...line, token]
      col += 1
      continue
    }
    const word = token
    if (word.length > perLine) {
      if (col > 0) {
        lines.push(line)
        line = []
        col = 0
      }
      for (let at = 0; at < word.length; at += perLine) {
        if (col > 0) {
          lines.push(line)
          line = []
          col = 0
        }
        line = word.slice(at, at + perLine)
        col = line.length
      }
      continue
    }
    if (col + word.length <= perLine) {
      line = [...line, ...word]
      col += word.length
    } else {
      lines.push(line)
      line = word
      col = word.length
    }
  }
  lines.push(line)
  return lines.map(coalesceChars)
}

// Adjacent characters sharing every mark become one run, so a wrapped line
// carries as few <tspan>s as the text actually needs.
function coalesceChars(chars) {
  const out = []
  for (const { ch, marks } of chars) {
    const last = out[out.length - 1]
    if (last && sameMarks(last, marks)) last.text += ch
    else out.push({ ...marks, text: ch })
  }
  return out
}
