// Paste multi-line indented / bulleted text onto a node and grow the matching
// subtree (spec diagram-types A5/M5). Pure parsing + a pure tree-builder so it is
// unit-testable without a store. The store wraps buildSubtree in one commit() so
// the whole paste is a single undoable unit (Part G6).

import { addChild } from './mindmapModel.js'

const BULLET = /^[-*+•·]\s+/
const TAB_WIDTH = 4

// Parse pasted text into a flat list of { text, level } in document order, where
// level is the indentation depth (0 = pasted-onto node's direct child). Blank
// lines are dropped; leading bullets/whitespace are stripped from the text.
export function parseIndentedText(raw) {
  const lines = String(raw).replace(/\r\n?/g, '\n').split('\n')
  const items = []
  for (const line of lines) {
    if (!line.trim()) continue
    items.push({ indent: indentWidth(line), text: cleanText(line) })
  }
  return normaliseLevels(items)
}

// Count leading indentation in spaces, treating each tab as TAB_WIDTH spaces.
function indentWidth(line) {
  let width = 0
  for (const char of line) {
    if (char === ' ') width += 1
    else if (char === '\t') width += TAB_WIDTH
    else break
  }
  return width
}

// Strip leading whitespace and an optional bullet marker.
function cleanText(line) {
  return line.replace(/^\s+/, '').replace(BULLET, '').trim()
}

// Map raw indent widths to dense 0..n levels: each distinct, increasing indent
// becomes the next deeper level; a smaller indent pops back to a known level so
// uneven spacing (2 vs 4 spaces vs tabs) still nests sensibly.
function normaliseLevels(items) {
  const stops = [] // indent widths seen, ascending, one per open level
  return items.map((item) => {
    while (stops.length && item.indent < stops[stops.length - 1]) stops.pop()
    if (!stops.length || item.indent > stops[stops.length - 1]) stops.push(item.indent)
    return { text: item.text, level: stops.length - 1 }
  })
}

// Build the parsed items as a subtree under `rootNodeId`, mutating the model.
// A running stack maps each level to the last node id created there, so a child
// attaches to the nearest shallower ancestor. Returns the created node ids.
export function buildSubtree(model, rootNodeId, items) {
  const parentAtLevel = [rootNodeId]
  const created = []
  for (const item of items) {
    const parentId = parentAtLevel[item.level] ?? rootNodeId
    const id = addChild(model, parentId, item.text)
    parentAtLevel[item.level + 1] = id
    parentAtLevel.length = item.level + 2
    created.push(id)
  }
  return created
}

// True when pasted text is worth treating as a subtree (more than one line, or a
// single bulleted line) rather than plain text typed into the node.
export function looksLikeOutline(raw) {
  const text = String(raw)
  if (text.includes('\n')) return text.trim().split('\n').filter((l) => l.trim()).length > 1
  return BULLET.test(text.trimStart())
}
