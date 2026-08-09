import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #176: 28 interactive controls in the editor announced as an unnamed "button",
// because they render a lucide glyph and nothing else — no text, no aria-label,
// no title. A frappe-ui Tooltip is not an accessible name either, which is why
// so many of them looked labelled and were not.
//
// The count is now zero, and this keeps it there. Adding a bare icon button is
// easy and the omission is invisible to everyone who is not using a screen
// reader, so the check has to be mechanical.
//
// frappe-ui's own Button is exempt: it takes `label` and applies it as the
// aria-label itself. This scans raw <button> elements only.
const root = path.dirname(fileURLToPath(import.meta.url))

function vueFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(full)
    return entry.name.endsWith('.vue') ? [full] : []
  })
}

function unnamedButtons(source) {
  const found = []
  for (const match of source.matchAll(/<button\b[^>]*?>/gs)) {
    const tag = match[0]
    if (tag.includes('aria-label') || tag.includes('title=')) continue
    const end = source.indexOf('</button>', match.index + tag.length)
    const inner = end > 0 ? source.slice(match.index + tag.length, end) : ''
    // Strip child elements: an icon <span> is decoration, not a name.
    if (!inner.replace(/<[^>]+>/g, '').trim()) {
      found.push(source.slice(0, match.index).split('\n').length)
    }
  }
  return found
}

describe('every interactive control has an accessible name (#176)', () => {
  it('no raw <button> renders without text, aria-label or title', () => {
    const offenders = []
    for (const file of vueFiles(root)) {
      for (const line of unnamedButtons(readFileSync(file, 'utf8'))) {
        offenders.push(`${path.relative(root, file)}:${line}`)
      }
    }
    expect(offenders, 'add aria-label, or use frappe-ui Button with a label').toEqual([])
  })
})
