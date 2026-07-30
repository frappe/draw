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

  it('drops a style that would fetch a remote address', () => {
    // No script, but it makes the viewer's browser call out to the author's server
    // the moment a shared diagram renders, which nothing in our editor needs.
    const clean = sanitizeRichText('<p style="background-image: url(https://evil.example/x.png)">t</p>')
    expect(clean).not.toContain('url(')
    expect(clean).not.toContain('evil.example')
    expect(clean).toContain('t')
  })

  it('returns null for nothing to render, so callers fall back to plain text', () => {
    expect(sanitizeRichText('')).toBeNull()
    expect(sanitizeRichText(null)).toBeNull()
    expect(sanitizeRichText(undefined)).toBeNull()
  })
})
