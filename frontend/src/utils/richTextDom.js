// The DOM half of table-cell rich text (#344): moving runs in and out of the
// contenteditable cell editor, and mapping a browser Selection to the plain-text
// offsets `richText.applyMark` works in. Kept apart from `diagram/richText.js`
// so the run algebra stays browser-free (CONVENTIONS).
//
// Marks ride on data attributes rather than being inferred from styling, so the
// tri-state survives the round trip: `data-bold="false"` is an explicit un-bold
// (a header cell), which is not the same as saying nothing at all.

import { MARKS, normalizeRuns, toRuns } from '@/diagram/richText.js'

const TAG_MARKS = {
  B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', U: 'underline',
  S: 'strike', STRIKE: 'strike', DEL: 'strike',
}

// The elements a browser starts a new line with. Only these two ever appear: the
// note pastes as plain text, so no other markup reaches the field.
const BLOCK_TAGS = new Set(['DIV', 'P'])

// Replace the editor's contents with `runs`, one span each.
export function runsToDom(root, runs) {
  root.replaceChildren(...toRuns(runs).map((run) => runSpan(root.ownerDocument, run)))
}

// Read the editor back as runs. Walks whatever markup is actually there — a
// browser may drop a bare text node in as you type — rather than assuming the
// spans we wrote are still intact.
//
// `multiline` keeps the line breaks (#501). A sticky note holds several lines, and
// the browser writes a break as MARKUP rather than as a "\n": typing Enter turns
// the next line into its own <div>. Reading only the text nodes therefore joins
// the lines silently, which is #416 all over again. A table cell stays single-line,
// so it keeps ignoring breaks — Enter there commits the edit.
export function domToRuns(root, { multiline = false } = {}) {
  const out = []
  collectRuns(root, {}, out, { multiline, root })
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

// The text of the line the caret is on, up to the caret. Read from the caret's own
// block (the <div> the browser made for that line, or `root` for the first one),
// because a Range spanning several blocks reports their text with the breaks
// between them missing. Shared by the sticky note and the table cell editor (#556)
// — both intercept Enter the same way, via stickyText.js's newlineIntent.
export function lineBeforeCaret(root) {
  const selection = root?.ownerDocument?.defaultView?.getSelection()
  if (!selection?.rangeCount || !root) return ''
  const range = selection.getRangeAt(0).cloneRange()
  range.setStart(blockOf(root, range.startContainer), 0)
  const text = range.toString()
  return text.slice(text.lastIndexOf('\n') + 1)
}

function blockOf(root, node) {
  let current = node
  while (current && current.parentNode !== root) current = current.parentNode
  return current?.nodeType === 1 ? current : root
}

// Take `count` characters back from the caret — the "- " marker being cleared when
// a list ends.
export function deleteBeforeCaret(count) {
  if (!count) return
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  range.setStart(range.startContainer, Math.max(0, range.startOffset - count))
  selection.removeAllRanges()
  selection.addRange(range)
  document.execCommand('delete')
}

function runSpan(doc, run) {
  const span = doc.createElement('span')
  span.textContent = run.text
  for (const mark of MARKS) {
    if (run[mark] !== undefined) span.dataset[mark] = String(run[mark])
  }
  span.style.fontWeight = styleFor(run.bold, '600', '400')
  span.style.fontStyle = styleFor(run.italic, 'italic', 'normal')
  // One CSS property carries both decorations, so they combine rather than one
  // silently winning: a run can be underlined AND struck through.
  span.style.textDecoration = decorationFor(run)
  return span
}

function styleFor(value, on, off) {
  if (value === undefined) return ''
  return value ? on : off
}

// The text-decoration for a run: underline, line-through, both, or nothing. Left
// empty when NEITHER mark is set, so the span keeps inheriting rather than
// declaring "none" over an ancestor that meant to decorate it.
export function decorationFor(run) {
  const parts = []
  if (run.underline) parts.push('underline')
  if (run.strike) parts.push('line-through')
  if (parts.length) return parts.join(' ')
  return run.underline === undefined && run.strike === undefined ? '' : 'none'
}

function collectRuns(node, inherited, out, context) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      if (child.nodeValue) out.push({ ...inherited, text: child.nodeValue })
      continue
    }
    if (child.nodeType !== 1) continue
    if (child.tagName === 'BR') {
      if (context.multiline && !isBlockFiller(child, context.root)) out.push(lineBreak(out, inherited))
      continue
    }
    // A block that FOLLOWS content opens a line; the one that opens the field does
    // not, or every note would start with a blank line.
    if (context.multiline && BLOCK_TAGS.has(child.tagName) && out.length) out.push(lineBreak(out, inherited))
    collectRuns(child, marksOf(child, inherited), out, context)
  }
}

// A break takes the marks of the text before it, so a note bolded end to end stays
// ONE bold run instead of being split in three by every line ending — which would
// also leave the toolbar reading the note as only partly bold.
function lineBreak(out, inherited) {
  const previous = out[out.length - 1]
  if (!previous) return { ...inherited, text: '\n' }
  const { text, ...marks } = previous
  return { ...marks, text: '\n' }
}

// Chrome closes an empty block with a <br> that exists only to give the block a
// height. The block boundary has already counted that line, so counting the <br>
// as well would double every blank line. The search stops at the editor root, so a
// <br> ending the field counts as a filler too.
function isBlockFiller(br, root) {
  for (let node = br; node && node !== root && !BLOCK_TAGS.has(node.tagName); node = node.parentNode) {
    if (node.nextSibling) return false
  }
  return true
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
