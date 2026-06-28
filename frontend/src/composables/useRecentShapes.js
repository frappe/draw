// Recently-used shape/line types, persisted so your common shapes are one click
// away at the top of the Shapes popover (spec 2.3). Stores type keys; the popover
// maps them back to the shape/line definitions.
import { ref } from 'vue'

const KEY = 'frappe-draw-recent-shapes'
const MAX = 6

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

export const recentShapes = ref(load())

export function pushRecentShape(type) {
  if (!type) return
  recentShapes.value = [type, ...recentShapes.value.filter((t) => t !== type)].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(recentShapes.value))
  } catch {
    /* ignore */
  }
}
