import { describe, it, expect } from 'vitest'
import { newlineIntent, plainPaste, stickyLines, stickyTextHeight } from './stickyText.js'

// A sticky note is one plain string, and the browser edits it as markup: Enter
// wraps each line in its own <div>, and `textContent` reads those back with nothing
// between them — "First line / Second line" was saved as "First lineSecond line"
// (#416). The component reads the field with innerText now. What is left to decide
// here is the one case the browser cannot: continuing a "- " list.

describe('newlineIntent', () => {
  it('breaks an ordinary line itself', () => {
    // Not left to the browser: a key event dispatched without a raw key code
    // reaches the page and inserts nothing, so the note would take lines from a
    // real keyboard and refuse them from anything else.
    expect(newlineIntent('First line')).toEqual({ deleteBefore: 0, insert: '\n' })
  })

  it('carries a hyphen list onto the next line', () => {
    expect(newlineIntent('- First point')).toEqual({ deleteBefore: 0, insert: '\n- ' })
  })

  it('keeps the indentation of the item it continues', () => {
    expect(newlineIntent('  - First point')).toEqual({ deleteBefore: 0, insert: '\n  - ' })
  })

  it('ends the list when the marker has nothing after it', () => {
    // Enter on an empty "- " clears the marker instead of adding another one, or a
    // list could never be finished without deleting by hand.
    expect(newlineIntent('- ')).toEqual({ deleteBefore: 2, insert: '' })
  })

  it('does not mistake a hyphenated word for a list', () => {
    expect(newlineIntent('well-known')).toEqual({ deleteBefore: 0, insert: '\n' })
  })
})

describe('plainPaste', () => {
  it('keeps the line breaks and normalizes CRLF', () => {
    expect(plainPaste('one\r\ntwo\rthree')).toBe('one\ntwo\nthree')
  })

  it('survives an empty clipboard', () => {
    expect(plainPaste(undefined)).toBe('')
  })
})

describe('stickyLines', () => {
  it('keeps hard line breaks as their own lines', () => {
    expect(stickyLines('one\ntwo', 400)).toEqual(['one', 'two'])
  })

  it('wraps a line too long for the note', () => {
    const lines = stickyLines('a sticky note holding a sentence long enough to wrap', 160)

    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('a sticky note holding a sentence long enough to wrap')
  })
})

describe('stickyTextHeight', () => {
  it('grows with each hard line break', () => {
    const one = stickyTextHeight('one', { width: 200 })
    const three = stickyTextHeight('one\ntwo\nthree', { width: 200 })

    expect(three).toBeGreaterThan(one)
  })

  it('pays for wrapped lines too, so long text stays inside the note', () => {
    const short = stickyTextHeight('short', { width: 160 })
    const long = stickyTextHeight('a sticky note holding a sentence long enough to wrap several times over', {
      width: 160,
    })

    expect(long).toBeGreaterThan(short * 2)
  })

  it('needs less height as the note gets wider', () => {
    const text = 'a sticky note holding a sentence long enough to wrap'

    expect(stickyTextHeight(text, { width: 400 })).toBeLessThan(stickyTextHeight(text, { width: 160 }))
  })

  it('keeps a line of room for an empty note', () => {
    expect(stickyTextHeight('', { width: 160 })).toBeGreaterThan(0)
  })
})
