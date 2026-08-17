// @vitest-environment jsdom
// This module is a DOM adapter, so it needs a document — the rest of the suite
// stays in the node environment per CONVENTIONS.
import { describe, it, expect, beforeEach } from 'vitest'
import { runsToDom, domToRuns, selectionOffsets, selectOffsets } from './richTextDom.js'
import { trimRuns } from '@/diagram/richText.js'

let root

beforeEach(() => {
  document.body.innerHTML = '<div id="cell" contenteditable="true"></div>'
  root = document.getElementById('cell')
})

describe('runs ↔ DOM round trip', () => {
  it('survives a round trip unchanged', () => {
    const runs = [{ text: 'Q1 ' }, { text: 'total', bold: true, underline: true }]
    runsToDom(root, runs)
    expect(domToRuns(root)).toEqual(runs)
  })

  it('renders a run with no marks as unstyled', () => {
    runsToDom(root, [{ text: 'plain' }])
    expect(root.textContent).toBe('plain')
    expect(domToRuns(root)).toEqual([{ text: 'plain' }])
  })

  // The tri-state is why marks ride on data attributes: "explicitly not bold"
  // must survive, or a header cell would silently re-bold itself on every edit.
  it('keeps an explicit false apart from saying nothing', () => {
    runsToDom(root, [{ text: 'Name', bold: false }])
    expect(root.querySelector('span').dataset.bold).toBe('false')
    expect(domToRuns(root)).toEqual([{ text: 'Name', bold: false }])
  })

  it('replaces previous contents rather than appending', () => {
    runsToDom(root, [{ text: 'first' }])
    runsToDom(root, [{ text: 'second' }])
    expect(root.textContent).toBe('second')
  })

  it('reads a bare text node the browser dropped in as an unmarked run', () => {
    root.append(document.createTextNode('typed'))
    expect(domToRuns(root)).toEqual([{ text: 'typed' }])
  })

  it('understands b/i/u markup a paste may leave behind', () => {
    root.innerHTML = 'a<b>bold</b><i>it</i>'
    expect(domToRuns(root)).toEqual([
      { text: 'a' },
      { text: 'bold', bold: true },
      { text: 'it', italic: true },
    ])
  })

  it('inherits marks through nested elements', () => {
    root.innerHTML = '<span data-bold="true">out<i>in</i></span>'
    expect(domToRuns(root)).toEqual([
      { text: 'out', bold: true },
      { text: 'in', bold: true, italic: true },
    ])
  })

  // A cell is single-line; Enter commits the edit, so a stray BR must not
  // smuggle a newline into the stored text.
  it('drops line breaks', () => {
    root.innerHTML = 'a<br>b'
    expect(domToRuns(root)).toEqual([{ text: 'ab' }])
  })

  it('merges adjacent spans that share marks', () => {
    root.innerHTML = '<span data-bold="true">ab</span><span data-bold="true">cd</span>'
    expect(domToRuns(root)).toEqual([{ text: 'abcd', bold: true }])
  })
})

// A sticky note holds several lines (#501), and the browser does not write them as
// "\n" — Enter puts the next line in its own <div>. Every fixture below is markup
// Chrome actually produced for the note editor, not a guess: reading only the text
// nodes joins the lines, which is exactly the #416 fault returning.
describe('multiline runs (#501)', () => {
  const runsOf = () => domToRuns(root, { multiline: true })

  it('reads a <div> per line as a line break', () => {
    root.innerHTML = 'First line<div>Second line</div>'
    expect(runsOf()).toEqual([{ text: 'First line\nSecond line' }])
  })

  it('does not open the note with a blank line', () => {
    // The FIRST block starts the text; only a later one begins a new line.
    root.innerHTML = '<div>One</div><div>Two</div>'
    expect(runsOf()).toEqual([{ text: 'One\nTwo' }])
  })

  it('reads a real <br> between text as a line break', () => {
    root.innerHTML = 'a<br>b'
    expect(runsOf()).toEqual([{ text: 'a\nb' }])
  })

  // Chrome closes an empty block with a filler <br> that only gives it height.
  // Counting it as well as the block boundary doubled every blank line.
  it('counts a blank line once, not twice', () => {
    root.innerHTML = '<span>A</span><div><span><br></span></div><div><span>B</span></div>'
    expect(runsOf()).toEqual([{ text: 'A\n\nB' }])
  })

  // Reading is not trimming: Enter as the last keystroke really does leave an empty
  // line in the field, and this reports what is there. The sticky editor trims on
  // commit — a note has always stored its text trimmed — so the two together are
  // the contract that matters.
  it('reports the empty line Enter leaves as the last keystroke', () => {
    root.innerHTML = 'Only line<div><br></div>'
    expect(runsOf()).toEqual([{ text: 'Only line\n' }])
    expect(trimRuns(runsOf())).toEqual([{ text: 'Only line' }])
  })

  // The browser clones the mark span onto the new line, so the break sits between
  // two bold runs. It has to take their marks or the note reads as partly bold and
  // the toolbar shows Bold inactive on a note that is bold end to end.
  it('keeps a note bolded end to end as one run', () => {
    root.innerHTML = '<span data-bold="true">bold text</span><div><span data-bold="true">second</span></div>'
    expect(runsOf()).toEqual([{ text: 'bold text\nsecond', bold: true }])
  })

  it('breaks runs where the marks really do change', () => {
    root.innerHTML = '<span data-bold="true">bold</span><div><span>plain</span></div>'
    expect(runsOf()).toEqual([{ text: 'bold\n', bold: true }, { text: 'plain' }])
  })

  it('still drops breaks for a single-line cell', () => {
    root.innerHTML = 'First line<div>Second line</div>'
    expect(domToRuns(root)).toEqual([{ text: 'First lineSecond line' }])
  })
})

describe('selection offsets', () => {
  it('reports the selection in plain-text coordinates across runs', () => {
    runsToDom(root, [{ text: 'ab' }, { text: 'cd', bold: true }])
    selectOffsets(root, 1, 3)
    expect(selectionOffsets(root)).toEqual({ start: 1, end: 3 })
  })

  it('round-trips a collapsed caret', () => {
    runsToDom(root, [{ text: 'hello' }])
    selectOffsets(root, 2, 2)
    expect(selectionOffsets(root)).toEqual({ start: 2, end: 2 })
  })

  it('clamps an offset past the end of the text', () => {
    runsToDom(root, [{ text: 'hi' }])
    selectOffsets(root, 99, 99)
    expect(selectionOffsets(root)).toEqual({ start: 2, end: 2 })
  })

  it('is null when the caret is outside this editor', () => {
    runsToDom(root, [{ text: 'hello' }])
    const other = document.createElement('div')
    other.textContent = 'elsewhere'
    document.body.append(other)
    const range = document.createRange()
    range.selectNodeContents(other)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    expect(selectionOffsets(root)).toBeNull()
  })
})
