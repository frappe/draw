// JSON-in-localStorage read/write for small UI preferences (recent colours,
// recent shapes, app settings). Separate from utils/localCache.js, which is the
// IndexedDB document cache — this is only for tiny, disposable chrome state.
//
// Both helpers swallow their errors. Reads fail on corrupt JSON; writes fail on
// the quota, and in Safari private mode setItem throws outright. A preference is
// never worth breaking the caller for, so the fallback is "act as if nothing was
// stored" rather than propagating.

export function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback
  } catch {
    return fallback
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota / private mode */
  }
}
