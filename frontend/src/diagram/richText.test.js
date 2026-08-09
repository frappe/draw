import { describe, it, expect } from 'vitest'
import {
  toRuns,
  runsToText,
  hasFormatting,
  normalizeRuns,
  applyMark,
  markState,
  resolveMark,
  sliceRuns,
  trimRuns,
  replaceRange,
  runsEqual,
} from './richText.js'

describe('toRuns', () => {
  it('reads a legacy plain-string cell as one unformatted run', () => {
    expect(toRuns('Revenue')).toEqual([{ text: 'Revenue' }])
  })

  it('treats an empty or missing cell as no runs', () => {
    expect(toRuns('')).toEqual([])
    expect(toRuns(undefined)).toEqual([])
  })

  // An untrusted document must not be able to smuggle junk into the render loop.
  it('drops malformed runs and non-boolean marks', () => {
    const runs = toRuns([
      { text: 'ok', bold: true },
      { text: '' },
      { nope: 1 },
      null,
      { text: 'x', italic: 'yes' },
    ])
    expect(runs).toEqual([{ text: 'ok', bold: true }, { text: 'x' }])
  })

  it('ignores a value that is neither a string nor an array', () => {
    expect(toRuns({ text: 'nope' })).toEqual([])
  })
})

describe('runsToText', () => {
  it('joins runs back into the plain string stored in cells', () => {
    expect(runsToText([{ text: 'Q1 ' }, { text: 'total', bold: true }])).toBe('Q1 total')
  })
})

describe('hasFormatting', () => {
  it('is false for plain text so the cell needs no runs entry', () => {
    expect(hasFormatting([{ text: 'plain' }])).toBe(false)
  })

  it('counts an explicit false — un-bolding a header cell is formatting', () => {
    expect(hasFormatting([{ text: 'Name', bold: false }])).toBe(true)
  })
})

describe('normalizeRuns', () => {
  it('merges neighbours that share every mark', () => {
    const runs = normalizeRuns([{ text: 'ab', bold: true }, { text: 'cd', bold: true }])
    expect(runs).toEqual([{ text: 'abcd', bold: true }])
  })

  it('keeps neighbours apart when a mark differs', () => {
    const runs = normalizeRuns([{ text: 'ab', bold: true }, { text: 'cd' }])
    expect(runs).toHaveLength(2)
  })

  it('does not mutate the runs it was given', () => {
    const input = [{ text: 'ab', bold: true }, { text: 'cd', bold: true }]
    normalizeRuns(input)
    expect(input[0].text).toBe('ab')
  })
})

describe('applyMark', () => {
  it('marks the middle of a run and leaves the edges alone', () => {
    expect(applyMark([{ text: 'hello' }], 1, 3, 'bold', true)).toEqual([
      { text: 'h' },
      { text: 'el', bold: true },
      { text: 'lo' },
    ])
  })

  it('marks a whole run without splitting it', () => {
    expect(applyMark([{ text: 'hello' }], 0, 5, 'bold', true)).toEqual([{ text: 'hello', bold: true }])
  })

  it('spans a run boundary', () => {
    const runs = applyMark([{ text: 'ab' }, { text: 'cd', italic: true }], 1, 3, 'bold', true)
    expect(runsToText(runs)).toBe('abcd')
    expect(runs).toEqual([
      { text: 'a' },
      { text: 'b', bold: true },
      { text: 'c', italic: true, bold: true },
      { text: 'd', italic: true },
    ])
  })

  it('clearing a mark drops the key so the cell inherits again', () => {
    const runs = applyMark([{ text: 'Name', bold: true }], 0, 4, 'bold', undefined)
    expect(runs).toEqual([{ text: 'Name' }])
  })

  it('records an explicit false, which is how a header cell un-bolds', () => {
    expect(applyMark([{ text: 'Name' }], 0, 4, 'bold', false)).toEqual([{ text: 'Name', bold: false }])
  })

  it('is a no-op for an empty range', () => {
    expect(applyMark([{ text: 'hello' }], 2, 2, 'bold', true)).toEqual([{ text: 'hello' }])
  })

  it('never changes the text, only the marks', () => {
    const runs = applyMark([{ text: 'hello world' }], 3, 8, 'underline', true)
    expect(runsToText(runs)).toBe('hello world')
  })

  it('clamps a range that runs past the end of the text', () => {
    const runs = applyMark([{ text: 'hi' }], 0, 99, 'bold', true)
    expect(runs).toEqual([{ text: 'hi', bold: true }])
  })
})

describe('markState', () => {
  const runs = [{ text: 'ab', bold: true }, { text: 'cd' }]

  it('is true when the whole range carries the mark', () => {
    expect(markState(runs, 0, 2, 'bold')).toBe(true)
  })

  it('is mixed when the range straddles marked and unmarked text', () => {
    expect(markState(runs, 0, 4, 'bold')).toBe('mixed')
  })

  it('is undefined when nothing in the range says anything', () => {
    expect(markState(runs, 2, 4, 'bold')).toBe(undefined)
  })

  it('a collapsed caret reports the run it sits after', () => {
    expect(markState(runs, 2, 2, 'bold')).toBe(true)
    expect(markState(runs, 0, 0, 'bold')).toBe(undefined)
  })
})

describe('resolveMark', () => {
  it('falls back to what the cell inherits when the run says nothing', () => {
    expect(resolveMark({ text: 'Name' }, 'bold', true)).toBe(true)
    expect(resolveMark({ text: 'Name' }, 'bold', false)).toBe(false)
  })

  it('an explicit false beats the inherited header bold', () => {
    expect(resolveMark({ text: 'Name', bold: false }, 'bold', true)).toBe(false)
  })
})

describe('sliceRuns', () => {
  const runs = [{ text: 'ab' }, { text: 'cd', bold: true }]

  it('keeps the marks on the slice it returns', () => {
    expect(sliceRuns(runs, 1, 3)).toEqual([{ text: 'b' }, { text: 'c', bold: true }])
  })

  it('returns nothing for an empty range', () => {
    expect(sliceRuns(runs, 2, 2)).toEqual([])
  })

  it('clamps a range past the end', () => {
    expect(runsToText(sliceRuns(runs, 0, 99))).toBe('abcd')
  })
})

describe('trimRuns', () => {
  it('drops surrounding whitespace but keeps the marks', () => {
    expect(trimRuns([{ text: '  ' }, { text: 'total', bold: true }, { text: ' ' }])).toEqual([
      { text: 'total', bold: true },
    ])
  })

  it('leaves inner spacing alone', () => {
    expect(runsToText(trimRuns([{ text: ' a b ' }]))).toBe('a b')
  })

  it('collapses an all-whitespace cell to nothing', () => {
    expect(trimRuns([{ text: '   ' }])).toEqual([])
  })
})

describe('replaceRange', () => {
  it('inserts text that inherits the marks in force at the caret', () => {
    const runs = replaceRange([{ text: 'bold', bold: true }], 4, 4, 'er')
    expect(runs).toEqual([{ text: 'bolder', bold: true }])
  })

  it('replaces a selection', () => {
    expect(runsToText(replaceRange([{ text: 'hello' }], 1, 4, 'X'))).toBe('hXo')
  })

  it('inserting at the very start takes no marks', () => {
    const runs = replaceRange([{ text: 'bold', bold: true }], 0, 0, 'x')
    expect(runs[0]).toEqual({ text: 'x' })
  })

  it('deletes when the replacement text is empty', () => {
    expect(runsToText(replaceRange([{ text: 'hello' }], 0, 2, ''))).toBe('llo')
  })
})

describe('runsEqual', () => {
  it('ignores how the runs happen to be split', () => {
    expect(runsEqual([{ text: 'ab' }, { text: 'cd' }], [{ text: 'abcd' }])).toBe(true)
  })

  it('is false when a mark differs', () => {
    expect(runsEqual([{ text: 'ab', bold: true }], [{ text: 'ab' }])).toBe(false)
  })

  it('treats a legacy string and its run form as equal', () => {
    expect(runsEqual('hello', [{ text: 'hello' }])).toBe(true)
  })
})
