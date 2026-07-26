// Deep clone via a JSON round-trip — the single definition used by the store,
// the history snapshots and the clipboard buffer (they all clone plain document
// data, never class instances).
//
// JSON semantics are deliberate, not incidental: keys whose value is `undefined`
// are DROPPED rather than preserved, which is what keeps a snapshot equal to what
// a save would persist. structuredClone would keep them (and would throw on the
// functions a reactive proxy can carry), so don't "upgrade" this without checking
// the history/autosave round-trip.
export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
