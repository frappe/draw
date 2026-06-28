// Debounced autosave (SPEC §8): saves the diagram document ~1.5s after the last
// change via the whitelisted save_diagram method, revision-checked for two-tab
// conflicts. Exposes a `status` ref ('saved' | 'saving' | 'error') and a
// `frozen` ref consumed by EditorShell / SaveIndicator. Unsaved state is held in
// memory and flushed on reconnect; connectivity loss freezes after ~5s.

import { ref, watch, onUnmounted } from 'vue'
import { createResource } from 'frappe-ui'
import { putLocalDoc, getLocalDoc, clearLocalDoc } from '@/utils/localCache.js'

const DEBOUNCE_MS = 1500
const OFFLINE_FREEZE_MS = 5000
const LOCAL_DEBOUNCE_MS = 400 // persist to IndexedDB sooner than the server save

export function useAutosave(store, diagramResource) {
  const status = ref('saved')
  const frozen = ref(null)
  const session = createSaveSession(store, diagramResource, status, frozen)

  const stopWatch = watch(
    () => store.getDocument(),
    () => session.scheduleSave(),
    { deep: true },
  )

  // Recover unsynced edits left in IndexedDB by a prior session (offline close /
  // crash), but only when they were made against the revision we just loaded —
  // never clobber a diagram that changed elsewhere.
  const stopRestore = watch(
    () => diagramResource.doc?.revision,
    (revision) => maybeRestoreLocal(session, store, diagramResource, revision),
    { immediate: true },
  )

  const stopConnectivity = watchConnectivity(session)
  onUnmounted(() => {
    stopWatch()
    stopRestore()
    stopConnectivity()
    session.teardown()
  })

  return { status, frozen, flush: session.flushNow }
}

// One-shot restore: if a dirty local copy exists for this diagram on the same
// base revision, load it and sync; if it predates the server's revision, discard.
async function maybeRestoreLocal(session, store, diagramResource, revision) {
  if (session.restoreChecked || revision == null) return
  const name = diagramResource.doc?.name
  if (!name) return
  session.restoreChecked = true
  const local = await getLocalDoc(name)
  if (!local?.dirty) return
  if (local.baseRevision === revision) {
    store.loadDocument(local.document)
    session.scheduleSave()
  } else {
    clearLocalDoc(name)
  }
}

// A save session bundles the debounce timer, the in-memory pending document, the
// last known server revision, and the offline-freeze timer.
function createSaveSession(store, diagramResource, status, frozen) {
  const saver = createResource({ url: 'frappe_draw.api.diagram.save_diagram' })
  const session = {
    debounceTimer: null,
    offlineTimer: null,
    pendingDocument: null,
    inFlight: false,
  }

  session.revision = () => diagramResource.doc?.revision || 0
  session.diagramName = () => diagramResource.doc?.name

  session.scheduleSave = () => scheduleSave(session, store, status, frozen)
  session.flushNow = () => flush(session, saver, diagramResource, status, frozen)
  session.teardown = () => {
    clearTimeout(session.debounceTimer)
    clearTimeout(session.offlineTimer)
    clearTimeout(session.localTimer)
  }
  return session
}

// Capture the latest document and (re)start the debounce window. The document is
// also persisted to IndexedDB on a shorter debounce so a crash/close before the
// server save still keeps the edits. Frozen sessions ignore further edits.
function scheduleSave(session, store, status, frozen) {
  if (frozen.value) return
  session.pendingDocument = store.getDocument()
  status.value = 'saving'
  clearTimeout(session.debounceTimer)
  session.debounceTimer = setTimeout(session.flushNow, DEBOUNCE_MS)
  clearTimeout(session.localTimer)
  session.localTimer = setTimeout(() => {
    putLocalDoc(session.diagramName(), session.pendingDocument, session.revision())
  }, LOCAL_DEBOUNCE_MS)
}

// Push the pending document to the server, handling stale-revision conflicts and
// connectivity failures. Held state is preserved so a later flush can retry.
async function flush(session, saver, diagramResource, status, frozen) {
  if (frozen.value || session.inFlight) return
  if (!session.pendingDocument || !session.diagramName()) return

  const document = session.pendingDocument
  session.inFlight = true
  try {
    const result = await saveDocument(saver, session, diagramResource, document)
    onSaveSuccess(session, diagramResource, status, document, result)
  } catch (error) {
    onSaveError(session, status, frozen, error)
  } finally {
    session.inFlight = false
  }
}

function saveDocument(saver, session, diagramResource, document) {
  return saver.submit({
    name: session.diagramName(),
    document: JSON.stringify(document),
    revision: session.revision(),
  })
}

// Clear the pending buffer only if nothing newer arrived mid-flight; refresh the
// local revision from the server so the next save passes the freshness check.
function onSaveSuccess(session, diagramResource, status, savedDocument, result) {
  if (result?.revision != null && diagramResource.doc) {
    diagramResource.doc.revision = result.revision
  }
  clearTimeout(session.offlineTimer)
  session.offlineTimer = null
  if (session.pendingDocument === savedDocument) {
    session.pendingDocument = null
    status.value = 'saved'
    // Server has the latest — drop the local override so the next open trusts it.
    clearLocalDoc(session.diagramName())
  } else {
    session.flushNow()
  }
}

// A stale revision freezes the editor for reload; a network failure starts the
// 5s offline-freeze countdown while keeping the unsaved document in memory.
function onSaveError(session, status, frozen, error) {
  status.value = 'error'
  if (isStaleRevision(error)) {
    frozen.value = 'This diagram was changed elsewhere — reload.'
    return
  }
  startOfflineFreeze(session, frozen)
}

function isStaleRevision(error) {
  const message = `${error?.messages?.join(' ') || error?.message || ''}`
  return message.includes('changed elsewhere')
}

function startOfflineFreeze(session, frozen) {
  if (session.offlineTimer) return
  session.offlineTimer = setTimeout(() => {
    frozen.value = "You're offline — reconnect to keep editing."
  }, OFFLINE_FREEZE_MS)
}

// Flush immediately when the browser regains connectivity so no edits are lost.
// Returns a disposer that detaches the listener on unmount.
function watchConnectivity(session) {
  const onReconnect = () => session.flushNow()
  window.addEventListener('online', onReconnect)
  return () => window.removeEventListener('online', onReconnect)
}
