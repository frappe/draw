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
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback // missing key
    const value = JSON.parse(raw)
    // Stored JSON null reads as "nothing meaningful", like a missing key. But a
    // stored 0 / false / "" is a real value and must survive: the old
    // `JSON.parse(...) || fallback` discarded all of those falsy values too.
    return value === null ? fallback : value
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
