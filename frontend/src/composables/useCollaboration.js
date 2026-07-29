// Real-time collaboration (spec 11.1), built the way Frappe Drive & Writer do it:
// a Yjs document synced peer-to-peer over y-webrtc (Frappe's signaling server),
// with y-indexeddb for offline, and Yjs "awareness" for live presence + cursors.
//
// Our document is JSON, not ProseMirror, so we map it onto Yjs shared types:
//   ymap 'shapes' / 'connectors' / 'sections' : id -> JSON string  (per-object CRDT,
//     so two people editing DIFFERENT objects merge cleanly)
//   ymap 'meta' : canvas / themePreset / diagramType / mindmap / flowchart /
//     whiteboard  (JSON strings; last-writer-wins per key — fine for the rarer
//     concurrent whole-model edits)
// The reactive store stays the source of truth locally; a guarded, debounced
// two-way bridge keeps store <-> Yjs in sync without echo loops. The JSON autosave
// is unchanged (each client rebuilds Yjs from the loaded JSON), so nothing extra
// is persisted server-side. With no peers it's a silent no-op.
//
// Because the signaling server is shared and public, the room is not derived from
// the diagram name: the backend issues a site-scoped room id + encryption password
// to users who may read the diagram, and only editors push changes into it.

import { ref, watch, onBeforeUnmount } from 'vue'
import { call } from 'frappe-ui'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'

// Matches Frappe Writer/Drive so it uses the same signaling + TURN infrastructure.
const REALTIME_CONFIG = {
  signaling: ['wss://signal.frappe.cloud'],
  peerOpts: {
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: ['turn:signal.frappe.cloud:3478?transport=udp', 'turn:signal.frappe.cloud:3478?transport=tcp'],
          username: 'turnuser',
          credential: 'turnpass',
        },
      ],
    },
  },
}

const META_KEYS = ['canvas', 'themePreset', 'diagramType', 'mindmap', 'flowchart', 'whiteboard']
const CURSOR_COLORS = ['#6846E3', '#0A84FF', '#16A34A', '#D97706', '#DB2777', '#0E7490', '#7C3AED']

export function useCollaboration(store, editorUi, name) {
  const collaborators = ref([]) // remote peers: { id, name, color, cursor:{x,y} }
  if (!name) return { collaborators, setCursor() {}, destroy() {} }

  const doc = new Y.Doc()
  let persistence = null
  let provider = null
  let canWrite = false
  let destroyed = false

  const yShapes = doc.getMap('shapes')
  const yConnectors = doc.getMap('connectors')
  const ySections = doc.getMap('sections')
  const yMeta = doc.getMap('meta')
  const maps = { shapes: yShapes, connectors: yConnectors, sections: ySections }

  let applyingRemote = false // guard: don't echo remote changes back into Yjs

  // ---- store -> Yjs (local edits) ------------------------------------------
  function pushToYjs() {
    // View-only collaborators observe and follow; they never write to the room.
    if (applyingRemote || !canWrite) return
    doc.transact(() => {
      for (const key of ['shapes', 'connectors', 'sections']) {
        reconcileList(maps[key], store.state[key] || [])
      }
      for (const key of META_KEYS) {
        const value = JSON.stringify(store.state[key] ?? null)
        if (yMeta.get(key) !== value) yMeta.set(key, value)
      }
    }, 'local')
  }

  // Set changed/new items by id; delete items no longer present.
  function reconcileList(ymap, list) {
    const ids = new Set()
    for (const item of list) {
      ids.add(item.id)
      const json = JSON.stringify(item)
      if (ymap.get(item.id) !== json) ymap.set(item.id, json)
    }
    for (const id of [...ymap.keys()]) if (!ids.has(id)) ymap.delete(id)
  }

  // ---- Yjs -> store (remote edits) -----------------------------------------
  function applyFromYjs() {
    applyingRemote = true
    try {
      for (const key of ['shapes', 'connectors', 'sections']) {
        const items = [...maps[key].values()].map((s) => JSON.parse(s))
        replaceListPreservingSelection(store.state, key, items)
      }
      for (const key of META_KEYS) {
        const raw = yMeta.get(key)
        if (raw !== undefined) store.state[key] = JSON.parse(raw)
      }
    } catch (error) {
      console.warn('Collaboration apply failed', error)
    } finally {
      applyingRemote = false
    }
  }

  // Replace an array in place so Vue reactivity + selection ids survive.
  function replaceListPreservingSelection(state, key, items) {
    state[key] = items
  }

  const debouncedPush = debounce(pushToYjs, 150)

  // React to any local document change.
  const stop = watch(
    () => [store.state.shapes, store.state.connectors, store.state.sections, store.state.canvas, store.state.themePreset, store.state.diagramType, store.state.mindmap, store.state.flowchart, store.state.whiteboard],
    () => debouncedPush(),
    { deep: true },
  )

  // React to any remote document change (only when it originated remotely).
  const observer = (events, transaction) => {
    if (transaction.origin === 'local') return
    applyFromYjs()
  }
  yShapes.observe(observer)
  yConnectors.observe(observer)
  ySections.observe(observer)
  yMeta.observe(observer)

  // ---- awareness: presence + live cursors ----------------------------------
  function attachAwareness(awareness) {
    if (!awareness) return
    awareness.setLocalStateField('user', currentUser())
    awareness.on('change', () => {
      const out = []
      awareness.getStates().forEach((s, clientId) => {
        if (clientId === awareness.clientID || !s.user) return
        out.push({ id: clientId, name: s.user.name, color: s.user.color, cursor: s.cursor || null })
      })
      collaborators.value = out
    })
  }

  function setCursor(point) {
    provider?.awareness?.setLocalStateField('cursor', point ? { x: point.x, y: point.y } : null)
  }

  function destroy() {
    destroyed = true
    stop()
    try {
      provider?.destroy()
      persistence?.destroy()
      doc.destroy()
    } catch (error) {
      /* ignore teardown races */
    }
  }
  onBeforeUnmount(destroy)

  // The room id and its encryption password come from the backend, which only
  // hands them out to users who may read this diagram (see api/diagram.py). The
  // diagram name is never used as the room: it is guessable and identical across
  // sites, which would join unrelated installs into one session.
  async function connect() {
    let session
    try {
      session = await call('draw.api.diagram.get_collab_room', { name })
    } catch (error) {
      // No access, offline, or signaling unavailable → collaboration stays off;
      // local editing and JSON autosave are unaffected.
      console.warn('Collaboration unavailable', error)
      return
    }
    if (destroyed || !session?.room) return

    canWrite = Boolean(session.can_write)
    // Only editors get the offline cache. The provider broadcasts whatever ends up
    // in the doc, whoever put it there — so replaying a view-only user's cached
    // updates would push edits they are no longer allowed to make (e.g. after an
    // edit share was downgraded to view).
    if (canWrite) {
      persistence = new IndexeddbPersistence(session.room, doc)
      // First sync: adopt the shared state if peers already have one, else seed ours.
      persistence.once('synced', () => {
        if (destroyed) return
        if (yShapes.size || yConnectors.size || yMeta.size) applyFromYjs()
        else pushToYjs()
      })
    }
    try {
      provider = new WebrtcProvider(session.room, doc, {
        ...REALTIME_CONFIG,
        password: session.password,
      })
      attachAwareness(provider.awareness)
    } catch (error) {
      console.warn('Collaboration unavailable', error)
    }
  }

  connect()

  return { collaborators, setCursor, destroy }
}

function currentUser() {
  const name = (typeof window !== 'undefined' && window.full_name) || 'Guest'
  // Stable colour per name so a person keeps the same cursor colour.
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return { name, color: CURSOR_COLORS[hash % CURSOR_COLORS.length] }
}

function debounce(fn, ms) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
