import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readJson, writeJson } from './localStore.js'

// Node test environment has no localStorage, so each test installs the store it
// needs. The failure paths matter most: a preference must never break a caller.
const original = globalThis.localStorage

function stub(impl) {
  globalThis.localStorage = impl
}

beforeEach(() => {
  const map = new Map()
  stub({
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  })
})

afterEach(() => {
  globalThis.localStorage = original
})

describe('readJson', () => {
  it('round-trips a written value', () => {
    writeJson('k', { a: 1 })
    expect(readJson('k', null)).toEqual({ a: 1 })
  })

  it('returns the fallback for a missing key', () => {
    expect(readJson('absent', [])).toEqual([])
  })

  it('returns the fallback for corrupt JSON instead of throwing', () => {
    globalThis.localStorage.setItem('k', '{not json')
    expect(readJson('k', [])).toEqual([])
  })

  it('returns the fallback when the stored value is JSON null', () => {
    writeJson('k', null)
    expect(readJson('k', 'fallback')).toBe('fallback')
  })

  it('preserves a falsy stored value (0, false, "") rather than the fallback', () => {
    for (const value of [0, false, '']) {
      writeJson('k', value)
      expect(readJson('k', 'fallback')).toBe(value)
    }
  })

  it('returns the fallback when localStorage itself throws (private mode)', () => {
    stub({
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    })
    expect(readJson('k', [])).toEqual([])
  })
})

describe('writeJson', () => {
  it('swallows a quota / private-mode failure rather than propagating it', () => {
    stub({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => writeJson('k', { a: 1 })).not.toThrow()
  })
})
