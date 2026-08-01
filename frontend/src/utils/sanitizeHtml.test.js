// @vitest-environment jsdom
//
// The only DOM-environment test in the suite: DOMPurify needs a real window, and the
// point of this file is what the browser actually does with the markup. Everything
// else stays node-only per vitest.config.js.
import { describe, it, expect } from 'vitest'
import { sanitizeRichText } from './sanitizeHtml.js'

// Rich shape text is persisted HTML and ShapeView renders it with v-html. A diagram
// can be shared or made public, and save_diagram takes whatever JSON is posted — so
// this markup is authored by someone else and lands in the viewer's DOM.
describe('sanitizeRichText', () => {
  it('keeps the markup our editor actually produces', () => {
    const html =
      '<p style="text-align: center"><strong>bold</strong> <em>italic</em> ' +
      '<span style="color: rgb(1, 2, 3)">coloured</span></p><ul><li>item</li></ul>'
    const clean = sanitizeRichText(html)
    expect(clean).toContain('<strong>bold</strong>')
    expect(clean).toContain('<em>italic</em>')
    expect(clean).toContain('text-align: center')
    expect(clean).toContain('color: rgb(1, 2, 3)')
    expect(clean).toContain('<li>item</li>')
  })

  it('drops the script-bearing tags entirely', () => {
    for (const payload of [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      '<svg><animate onbegin="alert(1)"/></svg>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<object data="x"></object>',
      '<p><embed src="x"></p>',
    ]) {
      const clean = sanitizeRichText(payload)
      expect(clean, payload).not.toMatch(/<(script|img|iframe|object|embed|svg|animate)\b/i)
      expect(clean, payload).not.toMatch(/\son[a-z]+\s*=/i)
    }
  })

  it('strips event handlers from tags it does keep', () => {
    const clean = sanitizeRichText('<p onclick="alert(1)" onmouseover="alert(2)">text</p>')
    expect(clean).not.toMatch(/\son[a-z]+\s*=/i)
    expect(clean).toContain('text')
  })

  it('refuses a javascript: link but keeps a real one', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
    expect(sanitizeRichText('<a href="https://frappe.io">x</a>')).toContain('https://frappe.io')
  })

  it('forces a safe rel on a link that opens a new tab (reverse tabnabbing)', () => {
    // A target without rel lets the opened page reach window.opener.
    const clean = sanitizeRichText('<a href="https://frappe.io" target="_blank">x</a>')
    expect(clean).toContain('target="_blank"')
    expect(clean).toContain('rel="noopener noreferrer"')
  })

  it('overrides an unsafe rel supplied in the markup when target is present', () => {
    const clean = sanitizeRichText('<a href="https://frappe.io" target="_blank" rel="opener">x</a>')
    expect(clean).not.toContain('rel="opener"')
    expect(clean).toContain('rel="noopener noreferrer"')
  })

  it('drops a style that would fetch a remote address', () => {
    // No script, but it makes the viewer's browser call out to the author's server
    // the moment a shared diagram renders, which nothing in our editor needs.
    const clean = sanitizeRichText('<p style="background-image: url(https://evil.example/x.png)">t</p>')
    expect(clean).not.toContain('url(')
    expect(clean).not.toContain('evil.example')
    expect(clean).toContain('t')
  })

  it('drops the remote-fetch styles the old url() blocklist missed', () => {
    // image-set() fetches without a literal "url(" token, and a CSS escape hides it
    // from a raw-string regex — so the allowlist keeps only color/text-align rather
    // than trying to blocklist url().
    for (const payload of [
      "<p style=\"background-image: image-set('https://evil.example/x.png' 1x)\">t</p>",
      '<span style="background: red; width: 5px">t</span>',
    ]) {
      const clean = sanitizeRichText(payload)
      expect(clean, payload).not.toContain('evil.example')
      expect(clean, payload).not.toContain('image-set')
      expect(clean, payload).not.toContain('background')
      expect(clean, payload).toContain('t')
    }
  })

  it('keeps color and text-align but drops every other declaration in the same style', () => {
    const clean = sanitizeRichText(
      '<p style="color: #ff0000; text-align: right; background: url(https://evil.example/x)">t</p>',
    )
    expect(clean).toContain('color: #ff0000')
    expect(clean).toContain('text-align: right')
    expect(clean).not.toContain('background')
    expect(clean).not.toContain('evil.example')
  })

  it('returns null for nothing to render, so callers fall back to plain text', () => {
    expect(sanitizeRichText('')).toBeNull()
    expect(sanitizeRichText(null)).toBeNull()
    expect(sanitizeRichText(undefined)).toBeNull()
  })
})
