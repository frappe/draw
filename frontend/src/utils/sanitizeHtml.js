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

// A style attribute can't run script, but a value that fetches a remote address
// (url(), image-set(), …) makes the viewer call an attacker-controlled server the
// moment a shared diagram renders. The editor only round-trips per-run `color` and
// per-paragraph `text-align` through inline styles, so rebuild the attribute from
// an allowlist of exactly those two — with validated values — instead of
// blocklisting `url(` (which image-set() and CSS escapes like `\75 rl(` slip past).
const SAFE_CSS_COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\)|[a-z]+)$/i
const SAFE_TEXT_ALIGN = ['left', 'right', 'center', 'justify', 'start', 'end']

const STYLE_ALLOW = {
  color: (value) => (SAFE_CSS_COLOR.test(value) ? value : null),
  'text-align': (value) => (SAFE_TEXT_ALIGN.includes(value.toLowerCase()) ? value : null),
}

if (purify?.isSupported) {
  purify.addHook('afterSanitizeAttributes', (node) => {
    // A link that opens a new tab (`target`) without `rel` lets the opened page
    // reach back through `window.opener` (reverse tabnabbing). The document is
    // untrusted, so force a safe rel whenever a target is present rather than
    // trusting whatever rel the markup carried.
    if (node.tagName === 'A' && node.getAttribute?.('target')) {
      node.setAttribute('rel', 'noopener noreferrer')
    }
    const style = node.getAttribute?.('style')
    if (!style) return
    const kept = []
    for (const declaration of style.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon < 0) continue
      const prop = declaration.slice(0, colon).trim().toLowerCase()
      const value = declaration.slice(colon + 1).trim()
      const validate = STYLE_ALLOW[prop]
      const safe = value && validate && validate(value)
      if (safe) kept.push(`${prop}: ${safe}`)
    }
    if (kept.length) node.setAttribute('style', kept.join('; '))
    else node.removeAttribute('style')
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
