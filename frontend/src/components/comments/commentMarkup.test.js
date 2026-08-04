import { describe, it, expect } from 'vitest'
import { parseComment, buildMentionToken, commentPreview, mentionedIds } from './commentMarkup.js'

describe('parseComment', () => {
  it('splits text and @mention tokens in order', () => {
    const segs = parseComment('hi @[Ann Lee](ann@x.com), see this')
    expect(segs).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', label: 'Ann Lee', id: 'ann@x.com' },
      { type: 'text', value: ', see this' },
    ])
  })

  it('handles a mention at the very start and end', () => {
    expect(parseComment('@[A](a@x.com)')).toEqual([{ type: 'mention', label: 'A', id: 'a@x.com' }])
    expect(parseComment('@[A](a@x.com) hi')[0]).toEqual({ type: 'mention', label: 'A', id: 'a@x.com' })
  })

  it('keeps two mentions distinct', () => {
    const ids = parseComment('@[A](a@x.com) and @[B](b@x.com)')
      .filter((s) => s.type === 'mention')
      .map((s) => s.id)
    expect(ids).toEqual(['a@x.com', 'b@x.com'])
  })

  it('returns plain text unchanged and empty for empty', () => {
    expect(parseComment('just text')).toEqual([{ type: 'text', value: 'just text' }])
    expect(parseComment('')).toEqual([])
    expect(parseComment(null)).toEqual([])
  })

  it('is not left in a stale regex state across calls (the /g flag trap)', () => {
    const input = 'ping @[A](a@x.com)'
    expect(parseComment(input)).toEqual(parseComment(input))
  })
})

describe('buildMentionToken', () => {
  it('encodes label + id', () => {
    expect(buildMentionToken({ name: 'a@x.com', full_name: 'Ann' })).toBe('@[Ann](a@x.com)')
  })
  it('falls back to the id when there is no name', () => {
    expect(buildMentionToken({ name: 'a@x.com' })).toBe('@[a@x.com](a@x.com)')
  })
})

describe('commentPreview', () => {
  it('collapses mention tokens to @Label and whitespace to single spaces', () => {
    expect(commentPreview('hey  @[Ann Lee](ann@x.com)\n\nlook')).toBe('hey @Ann Lee look')
  })
})

describe('mentionedIds', () => {
  it('lists every mentioned id', () => {
    expect(mentionedIds('@[A](a@x.com) x @[B](b@x.com)')).toEqual(['a@x.com', 'b@x.com'])
    expect(mentionedIds('no mentions')).toEqual([])
  })
})
