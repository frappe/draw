// Debounced autosave (SPEC §8): saves the diagram document ~1.5s after the last
// change via the whitelisted save_diagram method, revision-checked for concurrent
// writes. Exposes a `status` ref ('saved' | 'saving' | 'error') and a `frozen` ref,
// both rendered by EditorShell → TopToolbar → SaveIndicator. Unsaved state is held
// in memory and flushed on reconnect; connectivity loss freezes after ~5s. A
// revision race against a connected co-editor is retried instead of freezing.

import { ref, watch, onUnmounted } from 'vue'
import { createResource } from 'frappe-ui'
import { putLocalDoc, getLocalDoc, clearLocalDoc } from '@/utils/localCache.js'

const DEBOUNCE_MS = 1500
const OFFLINE_FREEZE_MS = 5000
const MAX_STALE_RETRIES = 3
const LOCAL_DEBOUNCE_MS = 400 // persist to IndexedDB sooner than the server save

export function useAutosave(
  store,
  diagramResource,
  getCrdtState = () => null,
  hasPeers = () => false,
) {
  const status = ref('saved')
  const frozen = ref(null)
  const session = createSaveSession(store, diagramResource, status, frozen)
  // Whether a co-editor is connected to the same Yjs room. A stale revision
  // between two peers of that room is a save race, not a conflict — see
  // recoverFromStaleRevision().
  session.hasPeers = hasPeers
  // Persist the collaborative CRDT binary beside the JSON so the offline cache and
  // the server share one lineage (see useCollaboration). A getter, so the doc's
  // latest state is read at save time, not captured once.
  session.getCrdtState = getCrdtState

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
  const stopPageHide = watchPageHide(session)
  const stopBeforeUnload = watchBeforeUnload(status, frozen)
  onUnmounted(() => {
    stopWatch()
    stopRestore()
    stopConnectivity()
    stopPageHide()
    stopBeforeUnload()
    // Persist the pending edit BEFORE the timers are cancelled: teardown used to
    // clear the local-save timer without flushing, so any change since the last
    // debounce (≥400ms of drawing, then navigating away) was lost with no recovery.
    session.persistPending()
    session.flushNow()
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
  const saver = createResource({ url: 'draw.api.diagram.save_diagram' })
  const revisionReader = createResource({ url: 'draw.api.diagram.get_revision' })
  const session = {
    debounceTimer: null,
    offlineTimer: null,
    pendingDocument: null,
    inFlight: false,
    // Why the editor is frozen: 'offline' (lift on reconnect) or 'stale' (needs a
    // reload). Tracked structurally so the reconnect handler doesn't have to
    // string-match the user-facing message.
    frozenReason: null,
    // Stale-revision retries spent inside the current flush (reset per flush), so
    // a race we keep losing stops re-sending instead of hammering the server.
    staleRetries: 0,
  }

  session.revision = () => diagramResource.doc?.revision || 0
  session.diagramName = () => diagramResource.doc?.name
  session.refreshRevision = () => refreshRevision(revisionReader, session, diagramResource)

  session.scheduleSave = () => scheduleSave(session, store, status, frozen)
  session.flushNow = () => flush(session, saver, diagramResource, status, frozen)
  session.teardown = () => {
    clearTimeout(session.debounceTimer)
    clearTimeout(session.offlineTimer)
    clearTimeout(session.localTimer)
  }
  // Write the in-memory pending document to IndexedDB right now. Called before the
  // timers are cancelled on unmount and on tab-close, so the edits made since the
  // last debounce survive to be recovered on reopen. No-op when nothing is pending.
  session.persistPending = () => {
    if (session.pendingDocument && session.diagramName()) {
      putLocalDoc(session.diagramName(), session.pendingDocument, session.revision())
    }
  }
  session.clearFrozen = () => {
    frozen.value = null
    session.frozenReason = null
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
// Exported for useAutosave.test.js: the mid-flight coalescing order below is
// load-bearing and was silently broken once, so it is unit-tested directly rather
// than only through the editor.
export async function flush(session, saver, diagramResource, status, frozen) {
  if (frozen.value || session.inFlight) return
  if (!session.pendingDocument || !session.diagramName()) return

  session.inFlight = true
  // The retry budget is per flush: it exists to stop a hot loop inside this call,
  // not to spend a session-long allowance that, once exhausted, would leave every
  // later save failing against a revision nothing refreshes any more.
  session.staleRetries = 0
  try {
    // Coalescing LOOP, not a recursive re-entry. An edit made while a save is in
    // flight leaves a newer pendingDocument behind, and it must reach the server
    // without waiting for the user's next change — otherwise closing the tab loses
    // it. Re-entering flush() from the success handler cannot do that: inFlight is
    // still set, so the nested call returns at the guard above and the newer
    // document is silently stranded. Looping here keeps inFlight held for the whole
    // sequence (we genuinely are in flight) and needs no unbounded recursion.
    while (session.pendingDocument && !frozen.value) {
      const document = session.pendingDocument
      try {
        const result = await saveDocument(saver, session, diagramResource, document)
        // Returns false once the pending document IS the one just saved.
        if (!onSaveSuccess(session, diagramResource, status, document, result)) break
      } catch (error) {
        // Read the peer state ONCE and hand the same answer to both decisions. A
        // peer joining or leaving between the retry check and the freeze check
        // would otherwise freeze a session that had just retried, or skip the
        // freeze for a conflict that was decided as peerless.
        const peered = Boolean(session.hasPeers?.())
        // A lost revision race against a co-editor is recoverable: refresh the
        // revision and send the same document again, rather than freezing.
        if (await recoverFromStaleRevision(session, error, peered)) continue
        onSaveError(session, status, frozen, error, peered)
        break // leave pendingDocument in place for a reconnect / next-edit retry
      }
    }
  } finally {
    session.inFlight = false
  }
}

function saveDocument(saver, session, diagramResource, document) {
  const payload = {
    name: session.diagramName(),
    document: JSON.stringify(document),
    revision: session.revision(),
  }
  // Only send the CRDT binary once collaboration has resolved its initial sync
  // (the getter returns null until then), so a half-loaded state can't overwrite
  // the stored one; a null just leaves the server's crdt_state untouched.
  const crdtState = session.getCrdtState?.()
  if (crdtState) payload.crdt_state = crdtState
  return saver.submit(payload)
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
    return false
  }
  // A newer edit landed mid-flight. Report it so flush()'s loop sends that document
  // too; do NOT re-enter flush() from here (inFlight is still held, so a nested call
  // would return at its guard and strand the newer document).
  return true
}

// A stale revision freezes the editor for reload; a network failure starts the
// 5s offline-freeze countdown while keeping the unsaved document in memory.
function onSaveError(session, status, frozen, error, peered = false) {
  status.value = 'error'
  if (isStaleRevision(error)) {
    // Only a conflict with a session we are NOT connected to freezes: it holds
    // edits we do not have, so saving over them would lose them. A peer of our own
    // Yjs room does not, so a race it wins just leaves this save pending for the
    // next edit to retry — freezing there is what silently dropped everything the
    // user drew afterwards (GitHub #171).
    if (peered) return
    frozen.value = 'This diagram was changed elsewhere — reload.'
    session.frozenReason = 'stale'
    return
  }
  startOfflineFreeze(session, frozen)
}

// A stale revision between two peers of the SAME Yjs room is not a conflict: both
// sides already hold the merged state, one of them simply saved first. Re-read the
// revision and send the same document again. Freezing there (GitHub #171) killed
// the losing peer's autosave for the rest of the page's life, so every shape they
// drew afterwards was silently dropped.
//
// With no peer connected the second writer is a genuine other session whose edits
// are NOT in our document, so this declines and the freeze stands. A refresh that
// fails (offline, access revoked) declines too, rather than retrying blind.
//
// LIMIT OF `peered`: it says a peer is connected, NOT that the writer we lost to is
// that peer. With asymmetric WebRTC (A and C in the room, B's transport blocked), B
// can advance the revision while A retries past it, and B's edits are then overwritten
// — where the old code would have frozen A. The invariant "we already hold their
// edits" only holds while every concurrent writer is a connected room peer. Tightening
// it means merging the server's crdt_state before the retry rather than trusting the
// room, which is a larger change than this fix; the freeze it replaces dropped a
// peer's own work unconditionally, on every ordinary collaborative session.
async function recoverFromStaleRevision(session, error, peered) {
  if (!isStaleRevision(error)) return false
  if (!peered) return false
  if (session.staleRetries >= MAX_STALE_RETRIES) return false
  session.staleRetries += 1
  return session.refreshRevision()
}

// Re-read the stored revision so the next save passes the freshness check. The
// document is deliberately not re-read: ours is the merged one.
async function refreshRevision(reader, session, diagramResource) {
  try {
    const revision = await reader.submit({ name: session.diagramName() })
    if (revision == null || !diagramResource.doc) return false
    diagramResource.doc.revision = revision
    return true
  } catch {
    return false
  }
}

function isStaleRevision(error) {
  // Structural signal from the backend (raises StaleRevisionError), so a genuine
  // revision conflict is detected regardless of the site's language. The message
  // substring stays only as a fallback for an older backend / English site.
  if (error?.exc_type === 'StaleRevisionError') return true
  const message = `${error?.messages?.join(' ') || error?.message || ''}`
  return message.includes('changed elsewhere')
}

function startOfflineFreeze(session, frozen) {
  if (session.offlineTimer) return
  session.offlineTimer = setTimeout(() => {
    frozen.value = "You're offline — reconnect to keep editing."
    session.frozenReason = 'offline'
  }, OFFLINE_FREEZE_MS)
}

// Flush immediately when the browser regains connectivity so no edits are lost.
// Returns a disposer that detaches the listener on unmount. Exported for
// useAutosave.test.js: the offline-freeze-lifting order below was once dead code
// (the reconnect handler ran but flush() early-returned while still frozen), so it
// is unit-tested directly rather than only through the editor.
export function watchConnectivity(session) {
  const onReconnect = () => {
    // Lift an offline freeze before flushing: flush() early-returns while frozen,
    // so without clearing it here the 'online' handler was dead code for exactly
    // the case it exists for, and the editor stayed frozen until a manual reload.
    // A stale-revision freeze is left in place — that genuinely needs a reload.
    if (session.frozenReason === 'offline') session.clearFrozen()
    session.flushNow()
  }
  window.addEventListener('online', onReconnect)
  return () => window.removeEventListener('online', onReconnect)
}

// Persist unsaved edits when the tab is hidden or closed. `pagehide` fires in the
// cases `beforeunload` misses (mobile, bfcache) and is the reliable last-moment
// hook: write the pending document to IndexedDB (recoverable on reopen) and make a
// best-effort server flush. Returns a disposer that detaches on unmount.
function watchPageHide(session) {
  const onHide = () => {
    session.persistPending()
    session.flushNow()
  }
  window.addEventListener('pagehide', onHide)
  return () => window.removeEventListener('pagehide', onHide)
}

// Warn before the tab closes ONLY when a save is genuinely failing — offline,
// stale-frozen, or errored — so recent edits that never reached the server aren't
// lost silently. Normal editing stays nag-free: the debounced save + IndexedDB
// recovery cover it, and a prompt on every close would be noise. When it does
// fire, the browser shows its own generic "Leave site?" prompt.
export function watchBeforeUnload(status, frozen) {
  const onBeforeUnload = (event) => {
    if (!frozen.value && status.value !== 'error') return
    event.preventDefault()
    event.returnValue = '' // some browsers require a set returnValue to prompt
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => window.removeEventListener('beforeunload', onBeforeUnload)
}
