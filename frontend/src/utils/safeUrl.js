// A hyperlink target from the document is untrusted (a diagram can be shared or
// made public, and save_diagram stores whatever JSON a client posts). Rendered as
// an <a href> or passed to window.open, a `javascript:` / `data:` URL executes in
// the viewer's origin — so every link is run through this before it is used.
//
// Allowlist, not blocklist: an explicit scheme must be http(s) or mailto; a
// scheme-less value (relative path, #anchor, //host) carries no script risk and is
// kept. Control characters are stripped first because browsers ignore them when
// resolving the scheme, so a "java<TAB>script:" value would otherwise slip past a
// naive scheme test.

const SAFE_SCHEME = /^(?:https?:|mailto:)/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

// Drop ASCII control chars (code < 0x20, plus DEL 0x7F) a URL parser ignores
// mid-scheme. Done by char code rather than a regex so no control byte or \u
// escape has to live in the source.
function stripControlChars(value) {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code >= 0x20 && code !== 0x7f) out += ch
  }
  return out
}

// The safe form of `url` for an href / window.open, or null when it must not be
// used (unknown or dangerous scheme).
export function safeHref(url) {
  if (typeof url !== 'string') return null
  const cleaned = stripControlChars(url).trim()
  if (!cleaned) return null
  if (HAS_SCHEME.test(cleaned)) return SAFE_SCHEME.test(cleaned) ? cleaned : null
  return cleaned
}

// The safe form of a document image `src`, or null to render nothing. An uploaded
// image is a same-origin site path (/files/…), so allow same-origin paths/URLs and
// inline `data:image/…` only. An external URL is blocked: rendered in an <image> it
// silently fetches from that host every time a shared diagram opens (a tracking /
// deanonymization vector), and it is never how Draw stores an uploaded image.
// SVG loaded via <image>/data: runs in the browser's static mode (no script, no
// sub-fetches), so a data:image/svg payload can't execute.
export function safeImageSrc(src) {
  if (typeof src !== 'string') return null
  const cleaned = stripControlChars(src).trim()
  if (!cleaned) return null
  if (/^data:image\//i.test(cleaned)) return cleaned
  // Same-origin relative path (Frappe file_url), but not a protocol-relative //host.
  if (cleaned.startsWith('/') && !cleaned.startsWith('//')) return cleaned
  // Absolute or protocol-relative: allow only when it resolves to this origin.
  if (HAS_SCHEME.test(cleaned) || cleaned.startsWith('//')) {
    if (typeof window === 'undefined' || !window.location) return null
    try {
      return new URL(cleaned, window.location.href).origin === window.location.origin ? cleaned : null
    } catch {
      return null
    }
  }
  return null
}
