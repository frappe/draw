// The DOM half of table-cell rich text (#344): moving runs in and out of the
// contenteditable cell editor, and mapping a browser Selection to the plain-text
// offsets `richText.applyMark` works in. Kept apart from `diagram/richText.js`
// so the run algebra stays browser-free (CONVENTIONS).
//
// Marks ride on data attributes rather than being inferred from styling, so the
// tri-state survives the round trip: `data-bold="false"` is an explicit un-bold
// (a header cell), which is not the same as saying nothing at all.

import { MARKS, normalizeRuns, toRuns } from '@/diagram/richText.js'

const TAG_MARKS = { B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', U: 'underline' }

// Replace the editor's contents with `runs`, one span each.
export function runsToDom(root, runs) {
  root.replaceChildren(...toRuns(runs).map((run) => runSpan(root.ownerDocument, run)))
}

// Read the editor back as runs. Walks whatever markup is actually there — a
// browser may drop a bare text node in as you type — rather than assuming the
// spans we wrote are still intact.
export function domToRuns(root) {
  const out = []
  collectRuns(root, {}, out)
  return normalizeRuns(out)
}

// The current selection as plain-text offsets, or null when the caret is not in
// this editor.
export function selectionOffsets(root) {
  const selection = root.ownerDocument.defaultView.getSelection()
  if (!selection || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  return {
    start: textLengthBefore(root, range.startContainer, range.startOffset),
    end: textLengthBefore(root, range.endContainer, range.endOffset),
  }
}

// Put the caret / selection back after re-rendering the runs.
export function selectOffsets(root, start, end) {
  const from = pointAt(root, start)
  const to = pointAt(root, end)
  const range = root.ownerDocument.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  const selection = root.ownerDocument.defaultView.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

function runSpan(doc, run) {
  const span = doc.createElement('span')
  span.textContent = run.text
  for (const mark of MARKS) {
    if (run[mark] !== undefined) span.dataset[mark] = String(run[mark])
  }
  span.style.fontWeight = styleFor(run.bold, '600', '400')
  span.style.fontStyle = styleFor(run.italic, 'italic', 'normal')
  span.style.textDecoration = styleFor(run.underline, 'underline', 'none')
  return span
}

function styleFor(value, on, off) {
  if (value === undefined) return ''
  return value ? on : off
}

function collectRuns(node, inherited, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      if (child.nodeValue) out.push({ ...inherited, text: child.nodeValue })
    } else if (child.nodeType === 1) {
      // Line breaks are dropped: a cell is single-line, Enter commits the edit.
      if (child.tagName !== 'BR') collectRuns(child, marksOf(child, inherited), out)
    }
  }
}

function marksOf(element, inherited) {
  const out = { ...inherited }
  const tagMark = TAG_MARKS[element.tagName]
  if (tagMark) out[tagMark] = true
  for (const mark of MARKS) {
    const attribute = element.dataset?.[mark]
    if (attribute === 'true') out[mark] = true
    else if (attribute === 'false') out[mark] = false
  }
  return out
}

// How much text sits before (container, offset) inside root.
function textLengthBefore(root, container, offset) {
  const range = root.ownerDocument.createRange()
  range.selectNodeContents(root)
  range.setEnd(container, offset)
  return range.toString().length
}

// The text node and offset that a plain-text offset lands on.
function pointAt(root, target) {
  const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */)
  let seen = 0
  let last = null
  while (walker.nextNode()) {
    const node = walker.currentNode
    const length = node.nodeValue.length
    if (seen + length >= target) return { node, offset: target - seen }
    seen += length
    last = node
  }
  return last ? { node: last, offset: last.nodeValue.length } : { node: root, offset: 0 }
}
