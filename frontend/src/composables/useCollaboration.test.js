import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive, nextTick } from 'vue'

// The collaboration session is a network component: the room comes from the
// backend, the transport is WebRTC and the offline cache is IndexedDB — none of
// which exist in the node test environment. Every one of those is stubbed at the
// module boundary; Yjs itself stays real, because what these tests pin is what
// does and does not end up inside the Y.Doc.
//
// The invariant that matters most here is the push gate: a client with no issued
// room must put nothing into the shared document. The room is only issued to
// users who may edit, so that gate is what keeps an unauthorized client's edits
// off the wire (see api/diagram.py `get_collab_room`).

const created = vi.hoisted(() => ({ docs: [], providers: [], persistences: [] }))
const api = vi.hoisted(() => ({ call: null }))

vi.mock('frappe-ui', () => ({ call: (...args) => api.call(...args) }))

vi.mock('yjs', async () => {
  const actual = await vi.importActual('yjs')
  class RecordedDoc extends actual.Doc {
    constructor(...args) {
      super(...args)
      created.docs.push(this)
    }
  }
  return { ...actual, Doc: RecordedDoc }
})

vi.mock('y-webrtc', () => ({
  WebrtcProvider: class {
    constructor(room, doc, options) {
      this.room = room
      this.doc = doc
      this.options = options
      this.awareness = { setLocalStateField: vi.fn(), on: vi.fn(), getStates: () => new Map(), clientID: 1 }
      this.destroy = vi.fn()
      created.providers.push(this)
    }
  },
}))

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    constructor(name, doc) {
      this.name = name
      this.doc = doc
      this.destroy = vi.fn()
      this.clearData = vi.fn(() => Promise.resolve())
      this.syncedHandlers = []
      created.persistences.push(this)
    }
    once(event, handler) {
      if (event === 'synced') this.syncedHandlers.push(handler)
    }
    emitSynced() {
      for (const handler of this.syncedHandlers) handler()
    }
  },
}))

// No component instance in a unit test, so the unmount hook is a no-op here;
// teardown is driven through the returned destroy() instead.
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return { ...actual, onBeforeUnmount: () => {} }
})

const { useCollaboration, userColorFor } = await import('./useCollaboration.js')

const POLL_MS = 60_000

function makeStore() {
  return {
    state: reactive({
      shapes: [],
      connectors: [],
      sections: [],
      canvas: { width: 1280, height: 720 },
      themePreset: 'ocean',
      diagramType: 'unified',
      mindmap: null,
      flowchart: null,
      whiteboard: null,
    }),
  }
}

// Let the pending API promise settle (the composable calls syncRoom() eagerly).
const flush = () => vi.advanceTimersByTimeAsync(0)

// Let the deep watcher fire and its 150ms debounce elapse.
async function edit(store, shape) {
  store.state.shapes.push(shape)
  await nextTick()
  await vi.advanceTimersByTimeAsync(200)
}

function shapeIds(doc) {
  return [...doc.getMap('shapes').keys()]
}

function connectorIds(doc) {
  return [...doc.getMap('connectors').keys()]
}

function metaKeys(doc) {
  return [...doc.getMap('meta').keys()]
}

let sessions

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  created.docs.length = 0
  created.providers.length = 0
  created.persistences.length = 0
  sessions = []
  // Responses are factories so a rejection is only created when the composable
  // actually asks for it (an eagerly created rejected promise reads as unhandled).
  api.call = vi.fn(() => {
    const next = sessions.shift()
    if (!next) throw new Error('unexpected extra poll')
    return next()
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('userColorFor (cursor colour keyed on user id, not name)', () => {
  it('is deterministic and returns a palette hex colour', () => {
    expect(userColorFor('alice@example.com')).toBe(userColorFor('alice@example.com'))
    expect(userColorFor('alice@example.com')).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('spreads distinct user ids across more than one colour', () => {
    // Two people named "Guest" with different ids must be able to differ — the
    // whole point of colouring by id. A spread across many ids proves it isn't
    // collapsing everyone to one colour the way name-hashing a shared name did.
    const ids = ['u1@x', 'u2@x', 'u3@x', 'u4@x', 'u5@x', 'u6@x', 'u7@x', 'u8@x']
    expect(new Set(ids.map(userColorFor)).size).toBeGreaterThan(1)
  })
})

describe('useCollaboration', () => {
  it('puts nothing in the shared document while no room is issued', async () => {
    sessions = [() => Promise.resolve({ room: null })]
    const store = makeStore()

    const collab = useCollaboration(store, {}, 'diagram-1')
    await flush()
    await edit(store, { id: 's1', type: 'rectangle' })

    expect(shapeIds(created.docs[0]), 'a client with no room must not seed the Y.Doc').toEqual([])
    collab.destroy()
  })

  it('creates no transport and no offline cache for a read-only user', async () => {
    sessions = [() => Promise.resolve({ room: null })]

    const collab = useCollaboration(makeStore(), {}, 'diagram-1')
    await flush()

    expect(created.providers).toHaveLength(0)
    expect(created.persistences).toHaveLength(0)
    collab.destroy()
  })

  it('opens the issued room with its encryption password and pushes local edits', async () => {
    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]
    const store = makeStore()

    const collab = useCollaboration(store, {}, 'diagram-1')
    await flush()
    await edit(store, { id: 's1', type: 'rectangle' })

    expect(created.providers).toHaveLength(1)
    expect(created.providers[0].room).toBe('room-a')
    expect(created.providers[0].options.password).toBe('pw-a')
    expect(created.persistences[0].name).toBe('room-a')
    expect(shapeIds(created.docs[0])).toEqual(['s1'])
    collab.destroy()
  })

  it('follows a rotation: closes the old room, opens the new, deletes the stale cache', async () => {
    sessions = [
      () => Promise.resolve({ room: 'room-a', password: 'pw-a' }),
      () => Promise.resolve({ room: 'room-b', password: 'pw-b' }),
    ]

    const collab = useCollaboration(makeStore(), {}, 'diagram-1')
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_MS)

    expect(created.providers[0].destroy).toHaveBeenCalled()
    expect(created.providers[1].room).toBe('room-b')
    expect(created.providers[1].options.password).toBe('pw-b')
    // y-indexeddb names its database after the room, so the old one is deleted
    // rather than merely closed — otherwise every share change orphans a database.
    expect(created.persistences[0].clearData).toHaveBeenCalled()
    expect(created.persistences[1].name).toBe('room-b')
    collab.destroy()
  })

  it('closes the room when access is revoked', async () => {
    sessions = [
      () => Promise.resolve({ room: 'room-a', password: 'pw-a' }),
      () => Promise.resolve({ room: null }),
    ]
    const store = makeStore()

    const collab = useCollaboration(store, {}, 'diagram-1')
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await edit(store, { id: 's-after-revoke', type: 'rectangle' })

    expect(created.providers).toHaveLength(1)
    expect(created.providers[0].destroy).toHaveBeenCalled()
    expect(created.persistences[0].clearData).toHaveBeenCalled()
    expect(shapeIds(created.docs[0]), 'edits after a revoke must not enter the doc').toEqual([])
    collab.destroy()
  })

  it('keeps the live session when a poll fails', async () => {
    sessions = [
      () => Promise.resolve({ room: 'room-a', password: 'pw-a' }),
      () => Promise.reject(new Error('offline')),
    ]
    const store = makeStore()

    const collab = useCollaboration(store, {}, 'diagram-1')
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await edit(store, { id: 's1', type: 'rectangle' })

    // A failed request is not an answer about access: tearing down here would cost
    // every peer up to a poll interval over a single network blip.
    expect(created.providers).toHaveLength(1)
    expect(created.providers[0].destroy).not.toHaveBeenCalled()
    expect(created.persistences[0].clearData).not.toHaveBeenCalled()
    expect(shapeIds(created.docs[0])).toEqual(['s1'])
    collab.destroy()
  })

  it('ignores an out-of-order response', async () => {
    let resolveFirst
    sessions = [
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      () => Promise.resolve({ room: 'room-b', password: 'pw-b' }),
    ]

    const collab = useCollaboration(makeStore(), {}, 'diagram-1')
    await flush()
    await vi.advanceTimersByTimeAsync(POLL_MS) // the newer poll answers first
    resolveFirst({ room: 'room-a', password: 'pw-a' })
    await flush()

    expect(created.providers).toHaveLength(1)
    expect(created.providers[0].room).toBe('room-b')
    collab.destroy()
  })

  it('keeps the offline cache on teardown', async () => {
    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]

    const collab = useCollaboration(makeStore(), {}, 'diagram-1')
    await flush()
    collab.destroy()

    // Unmount leaves the room unchanged, and the cache is what makes the next
    // open fast — only a rotation invalidates it.
    expect(created.persistences[0].destroy).toHaveBeenCalled()
    expect(created.persistences[0].clearData).not.toHaveBeenCalled()
  })

  it('stops polling after teardown', async () => {
    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]

    const collab = useCollaboration(makeStore(), {}, 'diagram-1')
    await flush()
    collab.destroy()
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)

    expect(api.call).toHaveBeenCalledTimes(1)
  })

  it('is inert without a diagram name', () => {
    const collab = useCollaboration(makeStore(), {}, undefined)

    expect(collab.collaborators.value).toEqual([])
    expect(api.call).not.toHaveBeenCalled()
    collab.setCursor({ x: 1, y: 1 })
  })

  // ---- CRDT lineage: offline cache ⨝ server (the way Frappe Writer does it) ----
  // The clobber this replaces: on open, the offline IndexedDB cache used to be
  // adopted wholesale over the freshly loaded server document. Now the doc is seeded
  // from the server's stored CRDT binary and the cache MERGES on top — a shared
  // lineage, so both a newer server edit and an offline edit survive.

  it('folds the server CRDT into the offline cache on open — both survive, no clobber', async () => {
    const Yreal = await vi.importActual('yjs')
    const { toBase64 } = await import('lib0/buffer')
    // A server document lineage carrying one shape, as base64 (what crdt_state holds).
    const serverDoc = new Yreal.Doc()
    serverDoc.getMap('shapes').set('s-server', JSON.stringify({ id: 's-server', type: 'rectangle' }))
    const serverCrdt = toBase64(Yreal.encodeStateAsUpdate(serverDoc))

    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]
    const store = makeStore()
    const collab = useCollaboration(store, {}, 'diagram-1', () => serverCrdt)
    await flush()

    const doc = created.docs[0]
    // What y-indexeddb loads into the doc before 'synced': a cached offline edit.
    doc.transact(() => doc.getMap('shapes').set('s-cache', JSON.stringify({ id: 's-cache', type: 'ellipse' })))

    created.persistences[0].emitSynced()
    await nextTick()

    // Both the server shape and the offline shape are present — a merge, not a replace.
    expect([...doc.getMap('shapes').keys()].sort()).toEqual(['s-cache', 's-server'])
    expect(store.state.shapes.map((s) => s.id).sort()).toEqual(['s-cache', 's-server'])
    collab.destroy()
  })

  it('preserves an edit made before the sync resolved (a store-only edit is not lost)', async () => {
    const Yreal = await vi.importActual('yjs')
    const { toBase64 } = await import('lib0/buffer')
    const serverDoc = new Yreal.Doc()
    serverDoc.getMap('shapes').set('s-server', JSON.stringify({ id: 's-server', type: 'rectangle' }))
    const serverCrdt = toBase64(Yreal.encodeStateAsUpdate(serverDoc))

    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]
    const store = makeStore()
    const collab = useCollaboration(store, {}, 'diagram-1', () => serverCrdt)
    await flush()

    // An edit the user made before collaboration synced — only in the store so far
    // (its debounced push to the doc has not fired yet).
    store.state.shapes = [{ id: 's-local', type: 'ellipse' }]

    created.persistences[0].emitSynced()
    await nextTick()

    // The local edit is folded into the reconciled union, not overwritten by it.
    expect(store.state.shapes.map((s) => s.id).sort()).toEqual(['s-local', 's-server'])
    collab.destroy()
  })

  it('honours a pre-sync delete without resurrecting it, and keeps an offline-only shape', async () => {
    const Yreal = await vi.importActual('yjs')
    const { toBase64 } = await import('lib0/buffer')
    // Server lineage carries two shapes; the loaded server document lists the same two.
    const serverDoc = new Yreal.Doc()
    serverDoc.getMap('shapes').set('s-server', JSON.stringify({ id: 's-server', type: 'rectangle' }))
    serverDoc.getMap('shapes').set('s-del', JSON.stringify({ id: 's-del', type: 'rectangle' }))
    const serverCrdt = toBase64(Yreal.encodeStateAsUpdate(serverDoc))
    const serverDocument = {
      canvas: { width: 1280, height: 720 },
      shapes: [{ id: 's-server' }, { id: 's-del' }],
      connectors: [],
      sections: [],
    }

    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]
    const store = makeStore()
    // The store was hydrated from the server document, then the user DELETED s-del in
    // the ~1-2s before collaboration synced (so it is gone from the store only).
    store.state.shapes = [{ id: 's-server' }]
    const collab = useCollaboration(store, {}, 'diagram-1', () => serverCrdt, () => serverDocument)
    await flush()

    const doc = created.docs[0]
    // A shape y-indexeddb loaded from the offline cache — never in the server document.
    doc.transact(() => doc.getMap('shapes').set('s-cache', JSON.stringify({ id: 's-cache', type: 'ellipse' })))

    created.persistences[0].emitSynced()
    await nextTick()

    // s-del does NOT reappear (the pre-sync delete is honoured); s-server is kept; and
    // the offline-only s-cache still survives (add-only merge for cache items).
    expect([...doc.getMap('shapes').keys()].sort()).toEqual(['s-cache', 's-server'])
    expect(store.state.shapes.map((s) => s.id).sort()).toEqual(['s-cache', 's-server'])
    collab.destroy()
  })

  it('snapshot() is null before the initial sync, then returns the reconciled doc as base64', async () => {
    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]
    const store = makeStore()
    store.state.shapes = [{ id: 's1', type: 'rectangle' }]
    const collab = useCollaboration(store, {}, 'diagram-1', () => null)
    await flush()

    // Before sync resolves, snapshot must be null so a save can't overwrite the
    // stored crdt_state with a half-loaded state.
    expect(collab.snapshot()).toBeNull()

    created.persistences[0].emitSynced() // no server CRDT → legacy path seeds from the store
    await nextTick()

    const base64 = collab.snapshot()
    expect(typeof base64).toBe('string')
    // It round-trips: applied to a fresh doc it reproduces the shape.
    const Yreal = await vi.importActual('yjs')
    const { fromBase64 } = await import('lib0/buffer')
    const check = new Yreal.Doc()
    Yreal.applyUpdate(check, fromBase64(base64))
    expect([...check.getMap('shapes').keys()]).toEqual(['s1'])
    collab.destroy()
  })

  // ---- Free-floating nodes sync per object, not as a meta blob (#122) ----------
  // On a unified doc the mind-map / flowchart nodes are ordinary role-tagged shapes
  // in shapes[] (+ connectors[]), NOT the sub-model blob (flattenSubmodels empties
  // state.mindmap / state.flowchart on load). So they must land in the per-object
  // `shapes` / `connectors` Yjs maps, keyed by id — that per-object CRDT is what lets
  // two people edit different nodes and merge cleanly. `mindmap` / `flowchart` stay in
  // META_KEYS on purpose: a LEGACY standalone doc still carries its whole tree/chart in
  // that last-writer-wins blob, so dropping them from META_KEYS would stop syncing it.
  it('a unified doc syncs free-floating mind-map / flowchart nodes per object, not as a meta blob', async () => {
    sessions = [() => Promise.resolve({ room: 'room-a', password: 'pw-a' })]
    const store = makeStore()

    const collab = useCollaboration(store, {}, 'diagram-1')
    await flush()

    // A migrated mind-map node and a migrated flowchart node are ordinary role-tagged
    // shapes; the branch/edge between them is an ordinary connector.
    store.state.shapes.push(
      { id: 'mm1', type: 'rectangle', mindmap: { isRoot: true } },
      { id: 'fc1', type: 'rectangle', flowchart: { nodeType: 'process' } },
    )
    store.state.connectors.push({ id: 'c1', from: { shapeId: 'mm1' }, to: { shapeId: 'fc1' } })
    await nextTick()
    await vi.advanceTimersByTimeAsync(200)

    const doc = created.docs[0]
    // Each node object lands in the per-object map, keyed by its id — not in `meta`.
    expect(shapeIds(doc).sort()).toEqual(['fc1', 'mm1'])
    expect(connectorIds(doc)).toEqual(['c1'])
    expect(metaKeys(doc)).not.toContain('mm1')
    expect(metaKeys(doc)).not.toContain('fc1')

    // The sub-model blobs are not what carries the nodes: they stay empty on a unified
    // doc and ride in `meta` as `null` (kept in META_KEYS only for legacy standalone docs).
    expect(store.state.mindmap).toBeNull()
    expect(store.state.flowchart).toBeNull()
    expect(doc.getMap('meta').get('mindmap')).toBe('null')
    expect(doc.getMap('meta').get('flowchart')).toBe('null')
    collab.destroy()
  })
})
