// Local-first document cache (IndexedDB). Mirrors the pattern frappe/slides uses:
// the in-flight document is written here on every change so unsynced edits
// survive a tab close, refresh or crash while offline. Each entry records the
// server revision the edits were based on, so restore-on-open can refuse to
// clobber a diagram that changed elsewhere. The autosave layer clears the entry
// once the server confirms the save.

const DB_NAME = 'frappe-draw'
const DB_VERSION = 1
const STORE = 'documents'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode, run) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE)
        const req = run(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// Save the in-flight document for `id`, tagged dirty with the base revision.
export function putLocalDoc(id, document, baseRevision) {
  if (!id) return Promise.resolve()
  return tx('readwrite', (store) =>
    store.put({ id, document, baseRevision: baseRevision || 0, dirty: true, updatedAt: Date.now() }),
  ).catch(() => {})
}

export function getLocalDoc(id) {
  if (!id) return Promise.resolve(null)
  return tx('readonly', (store) => store.get(id)).catch(() => null)
}

// Drop the entry once the server has the latest (no local override needed).
export function clearLocalDoc(id) {
  if (!id) return Promise.resolve()
  return tx('readwrite', (store) => store.delete(id)).catch(() => {})
}
