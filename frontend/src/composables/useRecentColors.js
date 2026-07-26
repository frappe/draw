// Recently-used colors, shared across every ColorPicker and persisted so the
// palette you actually use is one click away (spec 8.6). Updated on a settled
// pick (hex entry, swatch, or drag end) — not on every drag frame.
import { ref } from 'vue'
import { readJson, writeJson } from '@/utils/localStore.js'

const KEY = 'frappe-draw-recent-colors'
const MAX = 12

export const recentColors = ref(readJson(KEY, []))

export function pushRecentColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return
  const value = hex.toUpperCase()
  recentColors.value = [value, ...recentColors.value.filter((c) => c !== value)].slice(0, MAX)
  writeJson(KEY, recentColors.value)
}
