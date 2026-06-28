// Recently-used colors, shared across every ColorPicker and persisted so the
// palette you actually use is one click away (spec 8.6). Updated on a settled
// pick (hex entry, swatch, or drag end) — not on every drag frame.
import { ref } from 'vue'

const KEY = 'frappe-draw-recent-colors'
const MAX = 12

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

export const recentColors = ref(load())

export function pushRecentColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return
  const value = hex.toUpperCase()
  recentColors.value = [value, ...recentColors.value.filter((c) => c !== value)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(recentColors.value))
  } catch {
    /* ignore quota / private mode */
  }
}
