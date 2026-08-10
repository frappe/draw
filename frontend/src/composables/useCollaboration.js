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
// the diagram name: the backend issues a site-scoped room id + encryption password,
// and only to users who may edit — no server sits between the peers to hold anyone
// to read-only. The room also changes when the diagram's access list does, so we
// re-check it periodically and follow it; a peer whose share was revoked cannot
// derive the new room and is left behind in the old one.

import { ref, watch, onBeforeUnmount } from 'vue'
import { call } from 'frappe-ui'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { fromBase64, toBase64 } from 'lib0/buffer'
import { parseDiagramDocument } from '@/diagram/schema.js'

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

// How often to re-check the issued room, so a revoked share takes effect while
// the editor is open rather than at the next reload.
const ROOM_POLL_MS = 60_000

const META_KEYS = ['canvas', 'themePreset', 'diagramType', 'mindmap', 'flowchart', 'whiteboard']
const CURSOR_COLORS = ['#6846E3', '#0A84FF', '#16A34A', '#D97706', '#DB2777', '#0E7490', '#7C3AED']

// `getServerCrdt` returns the base64 CRDT binary stored on the server document
// (draw_diagram.crdt_state), or null. It is what makes the offline cache and the
// server one CRDT lineage: on open the doc is seeded from it, so a cached copy
// MERGES with — rather than clobbers — a newer server document.
// `getServerDoc` returns the loaded server document (the raw JSON the store was
// hydrated from), used at the first sync to tell a pre-sync DELETE apart from an
// offline-cache addition (see applyPreSyncDeletes).
export function useCollaboration(store, editorUi, name, getServerCrdt = () => null, getServerDoc = () => null) {
  const collaborators = ref([]) // remote peers: { id, name, color, cursor:{x,y} }
  if (!name) return { collaborators, setCursor() {}, snapshot: () => null, destroy() {} }

  const doc = new Y.Doc()
  let persistence = null
  let provider = null
  let room = null
  let poll = null
  let destroyed = false
  let syncGeneration = 0
  // Gate remote application until the initial cache+server sync has resolved.
  // y-indexeddb applies its cached updates during load, firing the observer with a
  // non-'local' origin; applying that before we've folded in the server binary and
  // decided how to hydrate the store would show a half-reconciled document.
  let ready = false

  const yShapes = doc.getMap('shapes')
  const yConnectors = doc.getMap('connectors')
  const ySections = doc.getMap('sections')
  const yMeta = doc.getMap('meta')
  const maps = { shapes: yShapes, connectors: yConnectors, sections: ySections }

  let applyingRemote = false // guard: don't echo remote changes back into Yjs

  // ---- store -> Yjs (local edits) ------------------------------------------
  function pushToYjs() {
    // No room means no write access (or none yet). The doc outlives any single
    // room, so anything accumulated here while unauthorized would be broadcast
    // the moment a room does open — keep it out in the first place.
    if (applyingRemote || !room) return
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

  // Add-only merge of the store into Yjs — set changed/new items, NEVER delete.
  // Used once at the initial sync: edits the user made before collaboration
  // resolved live only in the store (the doc did not track them yet), so fold them
  // into the reconciled doc rather than letting applyFromYjs overwrite them away.
  // Meta keys only fill a gap, so the server/peer value is never clobbered.
  function mergeStoreIntoYjs() {
    if (applyingRemote || !room) return
    doc.transact(() => {
      for (const key of ['shapes', 'connectors', 'sections']) {
        for (const item of store.state[key] || []) {
          const json = JSON.stringify(item)
          if (maps[key].get(item.id) !== json) maps[key].set(item.id, json)
        }
      }
      for (const key of META_KEYS) {
        if (!yMeta.has(key)) yMeta.set(key, JSON.stringify(store.state[key] ?? null))
      }
    }, 'local')
  }

  // The delete half of the initial merge, kept apart from the add-only merge above.
  // An object the user deleted in the ~1-2s before the first sync left the store but
  // not the seeded doc, so mergeStoreIntoYjs + applyFromYjs alone would resurrect it.
  // Remove from the doc any object that WAS in the loaded server document but is no
  // longer in the store — that is exactly a pre-sync deletion. An object that lives
  // only in the offline cache (never in the server document) is NOT in this set, so
  // offline-only additions still survive the merge.
  function applyPreSyncDeletes() {
    if (applyingRemote || !room) return
    let server
    try {
      server = parseDiagramDocument(getServerDoc())
    } catch {
      return // Unparseable server doc: skip deletes rather than guess (adds still merged).
    }
    doc.transact(() => {
      for (const key of ['shapes', 'connectors', 'sections']) {
        const present = new Set((store.state[key] || []).map((item) => item.id))
        for (const item of server[key] || []) {
          if (!present.has(item.id) && maps[key].has(item.id)) maps[key].delete(item.id)
        }
      }
    }, 'local')
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

  // Merge the server's stored CRDT binary into the doc, tagged 'server' so the
  // local watcher never echoes it back as a fresh edit. Malformed base64 is
  // ignored — the store still holds the server JSON, so nothing is lost.
  function applyServerCrdt(base64) {
    try {
      Y.applyUpdate(doc, fromBase64(base64), 'server')
    } catch (error) {
      console.warn('Collaboration: ignoring unreadable server CRDT', error)
    }
  }

  // The reconciled doc as a base64 CRDT update, for the server to store beside the
  // JSON (autosave). Null until the initial sync has resolved, so a save can never
  // overwrite the stored CRDT with a half-loaded (or empty) state.
  function snapshot() {
    if (!ready) return null
    return toBase64(Y.encodeStateAsUpdate(doc))
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
    if (transaction.origin === 'local' || !ready) return
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
    clearInterval(poll)
    closeRoom()
    try {
      doc.destroy()
    } catch {
      /* ignore teardown races */
    }
  }
  onBeforeUnmount(destroy)

  function openRoom(session) {
    room = session.room
    ready = false
    persistence = new IndexeddbPersistence(session.room, doc)
    // First sync (spec 11.1, the way Frappe Writer does it): the offline cache has
    // just been loaded into the doc. Fold the server's CRDT binary in on top — the
    // two share one lineage, so Yjs MERGES them (commutatively) instead of one
    // clobbering the other, and a newer server edit or an offline edit both survive.
    // Then hydrate the store from the reconciled doc.
    //
    // A document with no stored CRDT yet (saved before this shipped, or one whose
    // doc has not loaded) has no lineage to merge against: trust the freshly loaded
    // server JSON already in the store and seed the doc from it, ignoring any cache
    // from before this lineage existed. The first save then stamps crdt_state, so
    // every later open takes the merge path.
    persistence.once('synced', () => {
      if (destroyed) return
      const serverCrdt = getServerCrdt()
      if (serverCrdt) {
        applyServerCrdt(serverCrdt)
        // Fold in any edits made before this sync resolved (they live only in the
        // store so far): add-only first, then honour any pre-sync deletes, then
        // hydrate the store from the reconciled union.
        mergeStoreIntoYjs()
        applyPreSyncDeletes()
        applyFromYjs()
      } else {
        pushToYjs()
      }
      ready = true
    })
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

  // `dropCache` deletes the offline database as well as closing it. y-indexeddb
  // names that database after the room id, so a rotation would otherwise orphan
  // one per share change, permanently. On unmount the room is unchanged and the
  // cache is what makes the next open fast, so it stays.
  function closeRoom({ dropCache = false } = {}) {
    room = null
    collaborators.value = []
    try {
      provider?.destroy()
      if (dropCache) Promise.resolve(persistence?.clearData()).catch(() => {})
      else persistence?.destroy()
    } catch {
      /* ignore teardown races */
    }
    provider = null
    persistence = null
  }

  // The room id and its encryption password come from the backend, which hands
  // them out only to users who may edit this diagram (see api/diagram.py). They
  // also change whenever the diagram's access list does, so this runs on a timer:
  // losing edit access closes the session, gaining it opens one.
  async function syncRoom() {
    const generation = ++syncGeneration
    let session
    try {
      session = await call('draw.api.diagram.get_collab_room', { name })
    } catch (error) {
      // The call failed; that is not an answer about access. Tearing the session
      // down here would cost everyone in the room up to a poll interval over one
      // network blip, so keep the current room and re-check on the next tick.
      console.warn('Collaboration room check failed', error)
      return
    }
    // Responses can land out of order; only the newest one decides the room.
    if (destroyed || generation !== syncGeneration) return
    if ((session?.room || null) === room) return

    closeRoom({ dropCache: true })
    if (session?.room) openRoom(session)
  }

  syncRoom()
  poll = setInterval(syncRoom, ROOM_POLL_MS)

  return { collaborators, setCursor, snapshot, destroy }
}

// Stable cursor colour for a user, keyed on a value passed in (their user id).
// Keying on the id rather than the display name is what stops two people who
// happen to share a name (e.g. two "Guest"s) from also sharing a cursor colour.
export function userColorFor(key) {
  let hash = 0
  for (const ch of String(key || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return CURSOR_COLORS[hash % CURSOR_COLORS.length]
}

function currentUser() {
  const win = typeof window !== 'undefined' ? window : {}
  // Display the full name, but colour by the stable, unique user id (boot injects
  // both; see www/draw.py). Fall back to the name only when no id is present.
  const name = win.full_name || 'Guest'
  return { name, color: userColorFor(win.user_id || name) }
}

function debounce(fn, ms) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
