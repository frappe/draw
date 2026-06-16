// Debounced autosave (~1.5s) with revision check + Saved/Saving state (spec §8).
// Stub exposes a status ref so SaveIndicator can bind; the feature agent wires
// the debounce, REST save, and conflict handling.
import { ref } from 'vue'

export function useAutosave(store, diagramResource) {
  const status = ref('saved')
  return { status, store, diagramResource }
}
