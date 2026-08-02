// @vitest-environment jsdom
//
// jsdom so watchConnectivity can attach a real 'online' listener to window; the
// flush() tests below need no DOM and run identically under it.
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

// frappe-ui ships source that only resolves through its vite plugin, and the local
// cache wants IndexedDB — neither is reachable in the node test environment. flush()
// takes its saver by injection and only touches the cache to clear it, so stubbing
// both module boundaries keeps this a pure unit test of the coalescing order.
vi.mock('frappe-ui', () => ({ createResource: () => ({ submit: () => {} }) }))
vi.mock('@/utils/localCache.js', () => ({
  putLocalDoc: () => Promise.resolve(),
  getLocalDoc: () => Promise.resolve(null),
  clearLocalDoc: () => Promise.resolve(),
}))

const { flush, watchConnectivity, watchBeforeUnload } = await import('./useAutosave.js')

// Regression tests for the save-coalescing order in flush().
//
// The bug these exist for: flush() returns early while a save is in flight, and the
// retry for "a newer document arrived mid-flight" used to be issued from inside the
// try block — before `finally` cleared inFlight — so the retry hit that same guard
// and did nothing. The newer document then sat unsaved until the user happened to
// make another edit, and was lost outright if they closed the tab. Nothing else in
// the suite covers it, because it needs a save to be in flight at the exact moment
// another edit lands.

function harness({ saveImpl } = {}) {
  const calls = []
  const session = {
    pendingDocument: null,
    inFlight: false,
    revision: () => 1,
    diagramName: () => 'diagram-1',
  }
  const saver = {
    submit: vi.fn(async (payload) => {
      calls.push(JSON.parse(payload.document))
      if (saveImpl) await saveImpl(session, calls.length)
      return { revision: calls.length + 1 }
    }),
  }
  const diagramResource = { doc: { name: 'diagram-1', revision: 1 } }
  const status = ref('saving')
  const frozen = ref(null)
  session.flushNow = () => flush(session, saver, diagramResource, status, frozen)
  return { session, saver, diagramResource, status, frozen, calls }
}

describe('flush', () => {
  it('saves the pending document and settles to saved', async () => {
    const h = harness()
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.calls).toEqual([{ shapes: ['a'] }])
    expect(h.session.pendingDocument).toBeNull()
    expect(h.status.value).toBe('saved')
    expect(h.session.inFlight).toBe(false)
  })

  it('saves AGAIN when an edit lands while the first save is in flight', async () => {
    // The edit arrives mid-request, exactly as a user drawing during a save would.
    const h = harness({
      saveImpl: (session, callNo) => {
        if (callNo === 1) session.pendingDocument = { shapes: ['a', 'b'] }
      },
    })
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.calls, 'the mid-flight edit was never sent to the server').toEqual([
      { shapes: ['a'] },
      { shapes: ['a', 'b'] },
    ])
    expect(h.session.pendingDocument).toBeNull()
    expect(h.status.value).toBe('saved')
  })

  it('keeps coalescing across several mid-flight edits', async () => {
    const h = harness({
      saveImpl: (session, callNo) => {
        if (callNo === 1) session.pendingDocument = { v: 2 }
        if (callNo === 2) session.pendingDocument = { v: 3 }
      },
    })
    h.session.pendingDocument = { v: 1 }

    await h.session.flushNow()

    expect(h.calls).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }])
    expect(h.session.pendingDocument).toBeNull()
  })

  it('leaves inFlight false after a failed save so later edits can still save', async () => {
    const h = harness()
    h.saver.submit = vi.fn(async () => {
      throw new Error('network down')
    })
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.status.value).toBe('error')
    expect(h.session.inFlight, 'a failed save must not wedge the session').toBe(false)
    // The document is still pending, so a retry can pick it up.
    expect(h.session.pendingDocument).toEqual({ shapes: ['a'] })
  })

  it('does nothing while a save is already in flight', async () => {
    const h = harness()
    h.session.pendingDocument = { shapes: ['a'] }
    h.session.inFlight = true

    await h.session.flushNow()

    expect(h.calls).toEqual([])
  })

  it('does nothing when there is no pending document or no diagram', async () => {
    const h = harness()
    await h.session.flushNow() // pendingDocument is null
    expect(h.calls).toEqual([])

    h.session.pendingDocument = { shapes: [] }
    h.session.diagramName = () => undefined
    await h.session.flushNow()
    expect(h.calls).toEqual([])
  })

  it('does not save while frozen (conflict / offline)', async () => {
    const h = harness()
    h.session.pendingDocument = { shapes: ['a'] }
    h.frozen.value = 'changed elsewhere'

    await h.session.flushNow()

    expect(h.calls).toEqual([])
  })

  // The collaborative CRDT binary rides along with the JSON so the offline cache and
  // the server share one lineage (see useCollaboration). The getter returns null
  // until collaboration has synced, and a null must not send the key at all.
  it('includes crdt_state in the save when the collaboration snapshot is available', async () => {
    const h = harness()
    h.session.getCrdtState = () => 'BASE64-CRDT'
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.saver.submit.mock.calls[0][0].crdt_state).toBe('BASE64-CRDT')
  })

  it('omits crdt_state entirely when the snapshot is null (pre-sync)', async () => {
    const h = harness()
    h.session.getCrdtState = () => null
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.saver.submit.mock.calls[0][0]).not.toHaveProperty('crdt_state')
  })
})

// Regression tests for the offline-freeze recovery (finding D3).
//
// An offline save failure freezes the editor after ~5s. The 'online' handler exists
// to lift that freeze and flush — but flush() early-returns while frozen, so without
// clearing the freeze first the handler was dead code for exactly the case it exists
// for, and the editor stayed frozen until a manual reload. A stale-revision freeze is
// deliberately left in place, since that genuinely needs a reload.
function reconnectHarness(frozenReason) {
  const frozen = ref(frozenReason ? 'a freeze message' : null)
  const session = {
    frozenReason,
    frozen,
    flushNow: vi.fn(),
    clearFrozen: vi.fn(() => {
      frozen.value = null
      session.frozenReason = null
    }),
  }
  return { session, frozen }
}

describe('watchConnectivity', () => {
  it('lifts an offline freeze on reconnect, then flushes', () => {
    const { session, frozen } = reconnectHarness('offline')
    const dispose = watchConnectivity(session)

    window.dispatchEvent(new Event('online'))

    expect(session.clearFrozen, 'the offline freeze was never lifted').toHaveBeenCalled()
    expect(frozen.value).toBeNull()
    expect(session.flushNow).toHaveBeenCalled()
    dispose()
  })

  it('leaves a stale-revision freeze in place on reconnect', () => {
    const { session, frozen } = reconnectHarness('stale')
    const dispose = watchConnectivity(session)

    window.dispatchEvent(new Event('online'))

    // A stale conflict needs a reload; reconnecting must not silently resume saving.
    expect(session.clearFrozen).not.toHaveBeenCalled()
    expect(frozen.value).toBe('a freeze message')
    dispose()
  })

  it('detaches the listener when disposed', () => {
    const { session } = reconnectHarness('offline')
    const dispose = watchConnectivity(session)
    dispose()

    window.dispatchEvent(new Event('online'))

    expect(session.flushNow).not.toHaveBeenCalled()
  })
})

describe('watchBeforeUnload', () => {
  // Dispatch a cancelable beforeunload and report whether the handler tried to
  // block the navigation (which triggers the browser's "Leave site?" prompt).
  function fires(status, frozen) {
    const dispose = watchBeforeUnload(ref(status), ref(frozen))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    dispose()
    return event.defaultPrevented
  }

  it('warns only when a save is failing (error) or frozen (offline/stale)', () => {
    expect(fires('error', null)).toBe(true)
    expect(fires('saved', "You're offline — reconnect to keep editing.")).toBe(true)
    expect(fires('saved', 'This diagram was changed elsewhere — reload.')).toBe(true)
  })

  it('stays silent during normal editing (saved / saving)', () => {
    expect(fires('saved', null)).toBe(false)
    expect(fires('saving', null)).toBe(false)
  })

  it('detaches the listener when disposed', () => {
    const dispose = watchBeforeUnload(ref('error'), ref(null))
    dispose()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
