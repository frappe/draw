// Rich-text plumbing shared between the inline editor (TextEditor) and the
// right-palette text controls (TextSection). The idea (rich text in shapes) is
// borrowed from frappe/slides; the implementation here is our own and minimal.
//
// StarterKit (TipTap v3) already bundles bold / italic / underline / bullet &
// ordered lists, so we only add TextStyle + Color (per-run color) and TextAlign
// (per-paragraph alignment). A module-level `activeEditor` ref points at the
// editor currently being edited, so the palette can run commands on it.

import { shallowRef } from 'vue'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'

export const RICH_EXTENSIONS = [
  StarterKit,
  TextStyle,
  Color,
  TextAlign.configure({ types: ['paragraph', 'heading'] }),
]

// The TipTap editor for the shape/connector currently being edited (or null).
export const activeEditor = shallowRef(null)

export function setActiveEditor(editor) {
  activeEditor.value = editor
}
export function clearActiveEditor(editor) {
  if (activeEditor.value === editor) activeEditor.value = null
}

// Plain text → seed HTML for a shape that only has legacy `content`.
export function contentToHtml(content) {
  const text = String(content || '')
  if (!text) return '<p></p>'
  return text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('')
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Command helpers the palette buttons call against the active editor. Each is a
// no-op when nothing is being edited.
function run(fn) {
  const editor = activeEditor.value
  if (editor) fn(editor.chain().focus()).run()
}
export const richCommands = {
  toggleBold: () => run((c) => c.toggleBold()),
  toggleItalic: () => run((c) => c.toggleItalic()),
  toggleUnderline: () => run((c) => c.toggleUnderline()),
  toggleStrike: () => run((c) => c.toggleStrike()),
  toggleBulletList: () => run((c) => c.toggleBulletList()),
  toggleOrderedList: () => run((c) => c.toggleOrderedList()),
  setAlign: (align) => run((c) => c.setTextAlign(align)),
  setColor: (color) => run((c) => c.setColor(color)),
}

export function isMarkActive(name, attrs) {
  const editor = activeEditor.value
  // Guard a destroyed editor (unmounted while still referenced) and TipTap's
  // isActive() throwing "Cannot convert undefined or null to object" on some
  // transient states (empty doc / no selection) — return false ("not active"),
  // otherwise the computed that reads this re-throws on every reactive tick and
  // spams the console (surfaced by the whiteboard text-box + select-all path).
  if (!editor || editor.isDestroyed) return false
  try {
    return name ? editor.isActive(name, attrs) : editor.isActive(attrs)
  } catch {
    return false
  }
}
