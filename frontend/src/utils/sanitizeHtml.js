// Rich shape text is persisted as HTML (TipTap's getHTML) inside the diagram
// document, and ShapeView renders it with v-html. The document is NOT trusted
// input: save_diagram accepts whatever JSON a client posts, and a diagram can be
// shared or made public — so that HTML is authored by someone else and lands in a
// viewer's DOM. TipTap's schema drops unknown nodes when it PARSES content, but
// v-html never goes through TipTap, so the render path needs its own gate.
//
// DOMPurify (already in the tree — frappe-ui depends on it) with an allowlist
// matching what our editor can actually produce: StarterKit + TextStyle + Color +
// TextAlign. Inline styles are kept because per-run colour and per-paragraph
// alignment round-trip through them; `img` is NOT in the list, so the whole
// <img onerror> family is gone at the tag level, and DOMPurify enforces safe URI
// schemes on the one url-bearing attribute we allow (href).

import DOMPurify from 'dompurify'

// Tags our editor emits, plus the inline marks StarterKit ships. Anything else —
// script, iframe, img, svg, object, form — is dropped with its children kept as text.
const ALLOWED_TAGS = [
  'p', 'br', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre', 'mark',
  'blockquote', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a',
]

const ALLOWED_ATTR = ['style', 'class', 'href', 'target', 'rel', 'dir', 'start', 'type']

// Our own instance, not the shared default export: the hook below must not change
// sanitisation for frappe-ui, which imports DOMPurify for its own components.
const purify = typeof window === 'undefined' ? null : DOMPurify(window)

// A style attribute cannot execute script in any current browser, but url() in one
// still makes the viewer fetch an attacker-controlled address the moment a shared
// diagram renders. Nothing our editor produces needs it, so drop the whole
// attribute rather than trying to rewrite the declaration.
if (purify?.isSupported) {
  purify.addHook('afterSanitizeAttributes', (node) => {
    const style = node.getAttribute?.('style')
    if (style && /url\s*\(/i.test(style)) node.removeAttribute('style')
  })
}

// Sanitised markup, or null when there is nothing to render.
//
// Returns null when no DOM is available (SSR, a node test runner) instead of the
// input: DOMPurify reports isSupported=false there and its sanitize() hands the
// string straight back, which would be a fail-OPEN. Callers treat null as "no rich
// text" and fall back to the plain-text `content` field, so text still renders.
export function sanitizeRichText(html) {
  if (!html) return null
  if (!purify?.isSupported) return null
  return purify.sanitize(String(html), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  })
}
