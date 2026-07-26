import { describe, it, expect } from 'vitest'
import { clone } from './clone.js'

describe('clone', () => {
  it('deep copies nested structures', () => {
    const source = { shapes: [{ id: 's1', text: { content: 'hi' } }] }
    const copy = clone(source)
    expect(copy).toEqual(source)
    copy.shapes[0].text.content = 'changed'
    expect(source.shapes[0].text.content).toBe('hi')
  })

  it('drops undefined values, matching what a save would persist', () => {
    // History snapshots are compared against saved documents, so the JSON
    // round-trip semantics here are load-bearing — see the note in clone.js.
    expect(clone({ a: 1, b: undefined })).toEqual({ a: 1 })
    expect('b' in clone({ a: 1, b: undefined })).toBe(false)
  })
})
