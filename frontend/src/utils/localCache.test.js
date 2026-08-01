// C5 — round-trip + baseRevision/dirty coverage for the offline document cache.
// The autosave layer's restore-on-open logic trusts this module to preserve the
// base revision and dirty flag of unsynced edits; those were previously mocked
// away in useAutosave.test.js and never exercised for real. fake-indexeddb gives
// a real IndexedDB in the Node test env.
import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it } from 'vitest'

import { clearLocalDoc, getLocalDoc, putLocalDoc } from '@/utils/localCache.js'

// Distinct ids per test keep the module-cached DB connection from leaking state
// between cases; anything a test does write, it clears in afterEach.
const written = new Set()
function id(name) {
  written.add(name)
  return name
}
afterEach(async () => {
  await Promise.all([...written].map((k) => clearLocalDoc(k)))
  written.clear()
})

describe('localCache', () => {
  it('round-trips a stored document', async () => {
    const doc = { schemaVersion: 1, shapes: [{ id: 's1' }] }
    await putLocalDoc(id('doc-a'), doc, 7)

    const stored = await getLocalDoc('doc-a')
    expect(stored.document).toEqual(doc)
    expect(stored.id).toBe('doc-a')
  })

  it('tags the entry dirty with the base revision it was edited from', async () => {
    await putLocalDoc(id('doc-b'), { v: 1 }, 42)

    const stored = await getLocalDoc('doc-b')
    // Restore-on-open compares baseRevision against the server revision to refuse
    // clobbering a diagram that moved on; dirty marks it as an unsynced edit.
    expect(stored.baseRevision).toBe(42)
    expect(stored.dirty).toBe(true)
    expect(typeof stored.updatedAt).toBe('number')
  })

  it('defaults a missing/falsy base revision to 0 (never undefined)', async () => {
    await putLocalDoc(id('doc-c'), { v: 1 })
    expect((await getLocalDoc('doc-c')).baseRevision).toBe(0)

    await putLocalDoc(id('doc-c'), { v: 2 }, 0)
    expect((await getLocalDoc('doc-c')).baseRevision).toBe(0)
  })

  it('overwrites the entry on a later put (last write wins per id)', async () => {
    await putLocalDoc(id('doc-d'), { v: 1 }, 1)
    await putLocalDoc('doc-d', { v: 2 }, 2)

    const stored = await getLocalDoc('doc-d')
    expect(stored.document).toEqual({ v: 2 })
    expect(stored.baseRevision).toBe(2)
  })

  it('clears an entry once the server has confirmed the save', async () => {
    await putLocalDoc(id('doc-e'), { v: 1 }, 1)
    expect(await getLocalDoc('doc-e')).toBeTruthy()

    await clearLocalDoc('doc-e')
    expect(await getLocalDoc('doc-e')).toBeUndefined()
  })

  it('is a no-op for a missing id, never rejecting', async () => {
    await expect(putLocalDoc('', { v: 1 }, 1)).resolves.toBeUndefined()
    await expect(getLocalDoc('')).resolves.toBeNull()
    await expect(getLocalDoc(undefined)).resolves.toBeNull()
    await expect(clearLocalDoc('')).resolves.toBeUndefined()
  })
})
