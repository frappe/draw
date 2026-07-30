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

const { useCollaboration } = await import('./useCollaboration.js')

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
})
