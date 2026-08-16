import { describe, it, expect } from 'vitest'
import { saveFailure, blocksSaving } from './saveFailure.js'

// #504: "Save failed" told the user neither what had happened nor what to do. The
// failure that prompted the issue — a rebuild replacing the bundle under an open
// tab — read exactly like a transient 500, which needs nothing from anyone because
// the next edit retries.
//
// So every case below is really one question: can this tab keep saving, and if not,
// what is the user supposed to do about it?

const staleRevision = { exc_type: 'StaleRevisionError' }
const expiredSession = { exc_type: 'CSRFTokenError' }
const noPermission = { exc_type: 'PermissionError' }
const deleted = { exc_type: 'DoesNotExistError' }
const serverError = { response: { status: 500 }, exc_type: 'InternalServerError' }

describe('saveFailure', () => {
  it('treats an ordinary server error as retryable, and says the retry is coming', () => {
    const failure = saveFailure(serverError)
    expect(failure.kind).toBe('retry')
    expect(blocksSaving(failure)).toBe(false)
    expect(failure.message).toMatch(/retry/i)
  })

  it('treats an unrecognised failure as retryable rather than freezing the editor', () => {
    // Freezing is the destructive default: it stops the document being kept while
    // the user goes on drawing. An unknown failure has not earned that.
    for (const error of [null, undefined, {}, new Error('boom')]) {
      expect(blocksSaving(saveFailure(error))).toBe(false)
    }
  })

  it.each([
    ['a conflicting save', staleRevision, /changed elsewhere/i],
    ['an expired session', expiredSession, /session has expired/i],
    ['lost permission', noPermission, /no longer edit/i],
    ['a deleted diagram', deleted, /no longer exists/i],
  ])('blocks saving for %s, and names what to do', (_name, error, wording) => {
    const failure = saveFailure(error)
    expect(blocksSaving(failure)).toBe(true)
    expect(failure.message).toMatch(wording)
  })

  it.each([
    ['a conflicting save', staleRevision],
    ['an expired session', expiredSession],
    ['lost permission', noPermission],
  ])('offers a reload for %s, which can recover the session', (_name, error) => {
    expect(saveFailure(error).recoverable).toBe(true)
  })

  it('offers no reload for a deleted diagram — there is nothing to come back to', () => {
    const failure = saveFailure(deleted)
    expect(failure.recoverable).toBe(false)
    // It still has to say something: the alternative is typing into a void.
    expect(failure.message).toMatch(/download/i)
  })

  // The rule GitHub #171 was filed over: freezing on a race we can win silently
  // dropped everything drawn afterwards.
  it('retries a revision race against a peer of our own room, rather than freezing', () => {
    expect(blocksSaving(saveFailure(staleRevision, { peered: true }))).toBe(false)
    // Without a peer the same error IS a real second session, and does freeze.
    expect(blocksSaving(saveFailure(staleRevision, { peered: false }))).toBe(true)
  })

  it('reads an HTTP status when the server sent no exception type', () => {
    // A proxy or a gateway can answer without Frappe's exc_type.
    expect(blocksSaving(saveFailure({ response: { status: 403 } }))).toBe(true)
    expect(blocksSaving(saveFailure({ response: { status: 401 } }))).toBe(true)
    // A 5xx is the server having a bad moment, which the next edit retries past.
    expect(blocksSaving(saveFailure({ response: { status: 502 } }))).toBe(false)
  })

  // The failure this issue was actually filed over: a rebuild replaced the assets
  // under an open tab, so it was running old code against new routes.
  it.each([[400], [404], [405]])('reads a bare %i as a client too old to save', (status) => {
    const failure = saveFailure({ response: { status } })
    expect(blocksSaving(failure)).toBe(true)
    expect(failure.recoverable).toBe(true)
    expect(failure.message).toMatch(/updated.*reload/i)
  })

  it('does not call a bare 404 a deleted diagram', () => {
    // Telling someone their diagram no longer exists, when a route simply moved,
    // is both wrong and alarming — and reload is the fix for the real cause.
    expect(saveFailure({ response: { status: 404 } }).message).not.toMatch(/no longer exists/i)
    // Frappe's own "the record is gone" still says so.
    expect(saveFailure(deleted).message).toMatch(/no longer exists/i)
  })

  it('gives every blocking failure a message that says the action', () => {
    for (const error of [staleRevision, expiredSession, noPermission, deleted]) {
      const failure = saveFailure(error)
      expect(failure.message, `${error.exc_type} has no action`).toMatch(/reload|download|copy/i)
    }
  })
})
