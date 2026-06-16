// Debounced autosave (SPEC §8): saves the diagram document ~1.5s after the last
// change via the whitelisted save_diagram method, revision-checked for two-tab
// conflicts. Exposes a `status` ref ('saved' | 'saving' | 'error') and a
// `frozen` ref consumed by EditorShell / SaveIndicator. Unsaved state is held in
// memory and flushed on reconnect; connectivity loss freezes after ~5s.

import { ref, watch, onUnmounted } from 'vue'
import { createResource } from 'frappe-ui'

const DEBOUNCE_MS = 1500
const OFFLINE_FREEZE_MS = 5000

export function useAutosave(store, diagramResource) {
  const status = ref('saved')
  const frozen = ref(null)
  const session = createSaveSession(store, diagramResource, status, frozen)

  const stopWatch = watch(
    () => store.getDocument(),
    () => session.scheduleSave(),
    { deep: true },
  )

  const stopConnectivity = watchConnectivity(session)
  onUnmounted(() => {
    stopWatch()
    stopConnectivity()
    session.teardown()
  })

  return { status, frozen, flush: session.flushNow }
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
  }
  return session
}

// Capture the latest document and (re)start the debounce window. Frozen sessions
// ignore further edits — the user must reload.
function scheduleSave(session, store, status, frozen) {
  if (frozen.value) return
  session.pendingDocument = store.getDocument()
  status.value = 'saving'
  clearTimeout(session.debounceTimer)
  session.debounceTimer = setTimeout(session.flushNow, DEBOUNCE_MS)
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
