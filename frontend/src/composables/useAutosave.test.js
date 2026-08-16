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
vi.mock('frappe-ui', () => ({
  createResource: () => ({ submit: () => {} }),
  toast: { warning: () => {}, error: () => {} },
}))
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

// Regression tests for the stale-revision recovery (GitHub #171).
//
// Both peers of a Yjs room run their own autosave loop, so whichever saves second
// loses the revision race and gets a 417. Freezing there stopped that peer from
// ever saving again for the life of the page — the canvas stayed fully editable,
// so everything drawn afterwards was silently dropped. A race against a connected
// peer holds no edits we don't already have, so it is retried; a conflict with no
// peer connected is a genuine second session and still freezes.
const STALE_ERROR = { exc_type: 'StaleRevisionError' }

function staleHarness({ peers = true, staleCalls = 1, refreshOk = true } = {}) {
  const payloads = []
  const diagramResource = { doc: { name: 'diagram-1', revision: 1 } }
  const session = {
    pendingDocument: null,
    inFlight: false,
    staleRetries: 0,
    revision: () => diagramResource.doc.revision,
    diagramName: () => 'diagram-1',
    hasPeers: vi.fn(() => peers),
    refreshRevision: vi.fn(async () => {
      if (!refreshOk) return false
      diagramResource.doc.revision += 1 // the peer's save moved it on
      return true
    }),
  }
  const saver = {
    submit: vi.fn(async (payload) => {
      payloads.push(payload)
      if (payloads.length <= staleCalls) throw STALE_ERROR
      return { revision: diagramResource.doc.revision + 1 }
    }),
  }
  const status = ref('saving')
  const frozen = ref(null)
  session.flushNow = () => flush(session, saver, diagramResource, status, frozen)
  return { session, diagramResource, status, frozen, payloads, saver }
}

describe('flush on a stale revision', () => {
  it('retries the same document with a refreshed revision while a peer is connected', async () => {
    const h = staleHarness()
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.payloads.map((p) => p.revision), 'the retry reused the stale revision').toEqual([1, 2])
    expect(JSON.parse(h.payloads[1].document)).toEqual({ shapes: ['a'] })
    expect(h.frozen.value, 'a peer save race must not freeze the session').toBeNull()
    expect(h.status.value).toBe('saved')
    expect(h.session.pendingDocument).toBeNull()
  })

  it('freezes when no peer is connected — that is a real second session', async () => {
    const h = staleHarness({ peers: false })
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.saver.submit).toHaveBeenCalledTimes(1)
    expect(h.session.refreshRevision).not.toHaveBeenCalled()
    // The message names the ACTION now, not just the cause (#504) — a frozen
    // editor keeps accepting edits, so "changed elsewhere" alone left the user with
    // nothing to do about it. saveFailure owns the wording; this pins that the
    // conflict path still reaches it.
    expect(h.frozen.value).toContain('changed elsewhere')
    expect(h.frozen.value).toContain('reload')
    expect(h.status.value).toBe('error')
  })

  it('does not retry blind when the revision re-read fails', async () => {
    const h = staleHarness({ refreshOk: false })
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    // Re-sending at the same revision would just fail again; wait for the next edit.
    expect(h.saver.submit).toHaveBeenCalledTimes(1)
    expect(h.status.value).toBe('error')
    expect(h.session.pendingDocument).toEqual({ shapes: ['a'] })
  })

  it('stops retrying within one flush, but never freezes while a peer is connected', async () => {
    const h = staleHarness({ staleCalls: Infinity })
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.saver.submit, 'the first save plus three retries').toHaveBeenCalledTimes(4)
    expect(h.frozen.value, 'a frozen session never saves again — that is the bug').toBeNull()
    expect(h.status.value).toBe('error')
    expect(h.session.pendingDocument).toEqual({ shapes: ['a'] })
  })

  it('decides retry-or-freeze from ONE peer reading per failed save', async () => {
    // Two independent readings (one for the retry, one for the freeze) let a peer
    // leaving in between freeze a session that had just retried, and a peer joining
    // in between swallow a freeze that should have fired.
    const h = staleHarness({ staleCalls: Infinity })
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow()

    expect(h.saver.submit).toHaveBeenCalledTimes(4)
    expect(h.session.hasPeers, 'peer state was read twice for one save').toHaveBeenCalledTimes(4)
  })

  it('spends a FRESH retry budget on the next flush, so an edit can still recover', async () => {
    // The budget is per flush on purpose: a session-long allowance, once spent,
    // leaves every later save failing against a revision nothing refreshes.
    const h = staleHarness({ staleCalls: 5 })
    h.session.pendingDocument = { shapes: ['a'] }

    await h.session.flushNow() // 4 attempts, all stale
    expect(h.session.pendingDocument).toEqual({ shapes: ['a'] })

    await h.session.flushNow() // the user's next edit flushes again

    expect(h.saver.submit).toHaveBeenCalledTimes(6)
    expect(h.status.value, 'the 6th attempt was accepted').toBe('saved')
    expect(h.session.pendingDocument).toBeNull()
  })
})

// Regression tests for offline REPORTING (#417).
//
// Every save failure that was not a revision conflict used to start a 5s countdown
// to "You're offline — reconnect to keep editing." in the header. A 500 from
// save_diagram, a revoked permission and a dropped Wi-Fi all arrived there as the
// same sentence, so people were told they had no connection while they were online.
// Only a request that never reached the server is a connectivity problem now, and it
// is said once, as a toast.
function failingSaveHarness(error) {
  const session = {
    pendingDocument: { shapes: ['a'] },
    inFlight: false,
    revision: () => 1,
    diagramName: () => 'diagram-1',
    hasPeers: () => false,
    goOffline: vi.fn(),
    clearOffline: vi.fn(),
  }
  const saver = {
    submit: vi.fn(async () => {
      throw error
    }),
  }
  const status = ref('saving')
  const frozen = ref(null)
  session.flushNow = () => flush(session, saver, { doc: { name: 'diagram-1', revision: 1 } }, status, frozen)
  return { session, status, frozen }
}

// A server that answered, with the shape frappe-ui gives an HTTP error.
const SERVER_ERROR = Object.assign(new Error('Internal Server Error'), {
  response: { status: 500 },
  messages: ['Internal Server Error'],
})
// A request that never completed: fetch rejects with a bare TypeError.
const NETWORK_ERROR = new TypeError('Failed to fetch')

describe('offline reporting', () => {
  it('does not claim offline when the server answered with an error', async () => {
    const h = failingSaveHarness(SERVER_ERROR)

    await h.session.flushNow()

    expect(h.session.goOffline, 'a 500 is not a lost connection').not.toHaveBeenCalled()
    expect(h.session.clearOffline).toHaveBeenCalled()
    expect(h.status.value, 'it is still a failed save').toBe('error')
    expect(h.frozen.value, 'and it must not freeze the editor').toBeNull()
  })

  it('reports offline when the request never reached the server', async () => {
    const h = failingSaveHarness(NETWORK_ERROR)

    await h.session.flushNow()

    expect(h.session.goOffline).toHaveBeenCalled()
    expect(h.frozen.value, 'losing the network no longer freezes the editor').toBeNull()
    expect(h.session.pendingDocument, 'the edit is held for the reconnect flush').toEqual({ shapes: ['a'] })
  })

  it('separates a dead network from an unreachable server', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const h = failingSaveHarness(NETWORK_ERROR)

    await h.session.flushNow()

    // false = the browser itself is offline, so the toast says "You're offline"
    // rather than blaming the server.
    expect(h.session.goOffline).toHaveBeenCalledWith(false)
    online.mockRestore()
  })
})

function reconnectHarness({ frozenMessage = null } = {}) {
  const frozen = ref(frozenMessage)
  const session = {
    frozen,
    flushNow: vi.fn(),
    goOffline: vi.fn(),
    clearOffline: vi.fn(),
  }
  return { session, frozen }
}

describe('watchConnectivity', () => {
  it('clears the offline state on reconnect, then flushes', () => {
    const { session } = reconnectHarness()
    const dispose = watchConnectivity(session)

    window.dispatchEvent(new Event('online'))

    expect(session.clearOffline).toHaveBeenCalled()
    expect(session.flushNow, 'edits made offline must go up on reconnect').toHaveBeenCalled()
    dispose()
  })

  it('announces a disconnection as it happens, without waiting for a save to fail', () => {
    const { session } = reconnectHarness()
    const dispose = watchConnectivity(session)

    window.dispatchEvent(new Event('offline'))

    expect(session.goOffline).toHaveBeenCalled()
    dispose()
  })

  it('leaves a stale-revision freeze in place on reconnect', () => {
    const { session, frozen } = reconnectHarness({ frozenMessage: 'a freeze message' })
    const dispose = watchConnectivity(session)

    window.dispatchEvent(new Event('online'))

    // A stale conflict needs a reload; reconnecting must not silently resume saving.
    expect(frozen.value).toBe('a freeze message')
    dispose()
  })

  it('detaches the listener when disposed', () => {
    const { session } = reconnectHarness()
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

  it('warns when a save is failing (error) or the editor is frozen (stale)', () => {
    // Offline reaches this through 'error': the save that could not go out is what
    // makes closing the tab risky, and it is the state an offline editor sits in.
    expect(fires('error', null)).toBe(true)
    expect(fires('saved', 'This diagram was changed elsewhere — reload to see the latest version.')).toBe(true)
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
