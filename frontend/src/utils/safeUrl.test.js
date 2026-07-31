// @vitest-environment jsdom
//
// jsdom so safeImageSrc can resolve absolute URLs against a real window.location
// (default origin http://localhost:3000). safeHref needs no DOM.
import { describe, it, expect } from 'vitest'
import { safeHref, safeImageSrc } from './safeUrl.js'

// safeHref gates untrusted link targets from the document (a shared/public diagram
// can carry any string). The security property: no `javascript:`/`data:` URL may
// survive to reach an <a href> or window.open, including ones disguised with the
// control characters a browser ignores when parsing the scheme.

describe('safeHref', () => {
  it('keeps ordinary http(s) and mailto links', () => {
    expect(safeHref('https://frappe.io')).toBe('https://frappe.io')
    expect(safeHref('http://example.com/a?b=1')).toBe('http://example.com/a?b=1')
    expect(safeHref('mailto:hi@frappe.io')).toBe('mailto:hi@frappe.io')
  })

  it('keeps scheme-less links (relative, anchor, protocol-relative) — no script risk', () => {
    expect(safeHref('/app/draw')).toBe('/app/draw')
    expect(safeHref('#section')).toBe('#section')
    expect(safeHref('example.com/path')).toBe('example.com/path')
    expect(safeHref('//cdn.example.com/x')).toBe('//cdn.example.com/x')
  })

  it('rejects javascript:, data:, vbscript: and other dangerous schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JavaScript:alert(1)')).toBeNull()
    expect(safeHref('  javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeHref('vbscript:msgbox(1)')).toBeNull()
    expect(safeHref('file:///etc/passwd')).toBeNull()
  })

  it('rejects a scheme disguised with control characters the browser ignores', () => {
    // A browser strips the tab and parses `javascript:` — a naive regex on the raw
    // string would miss it, so safeHref strips control chars before testing.
    expect(safeHref('java\tscript:alert(1)')).toBeNull()
    expect(safeHref('java\nscript:alert(1)')).toBeNull()
    expect(safeHref('\x01javascript:alert(1)')).toBeNull()
  })

  it('returns null for empty or non-string input', () => {
    expect(safeHref('')).toBeNull()
    expect(safeHref('   ')).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(safeHref(undefined)).toBeNull()
    expect(safeHref(42)).toBeNull()
  })
})

describe('safeImageSrc', () => {
  it('keeps same-origin uploaded images (relative path or same-origin URL) and data: images', () => {
    expect(safeImageSrc('/files/pic.png')).toBe('/files/pic.png')
    expect(safeImageSrc('/private/files/pic.png')).toBe('/private/files/pic.png')
    expect(safeImageSrc(`${window.location.origin}/files/pic.png`)).toBe(`${window.location.origin}/files/pic.png`)
    expect(safeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('blocks images loaded from an external host (the tracking vector)', () => {
    expect(safeImageSrc('https://evil.example/track.gif')).toBeNull()
    expect(safeImageSrc('http://evil.example/track.gif')).toBeNull()
    expect(safeImageSrc('//evil.example/track.gif')).toBeNull()
  })

  it('blocks a non-image data: URI and junk input', () => {
    expect(safeImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeImageSrc('javascript:alert(1)')).toBeNull()
    expect(safeImageSrc('')).toBeNull()
    expect(safeImageSrc(null)).toBeNull()
  })
})
