// Recently-used shape/line types, persisted so your common shapes are one click
// away at the top of the Shapes popover (spec 2.3). Stores type keys; the popover
// maps them back to the shape/line definitions.
import { ref } from 'vue'
import { readJson, writeJson } from '@/utils/localStore.js'

const KEY = 'frappe-draw-recent-shapes'
const MAX = 6

export const recentShapes = ref(readJson(KEY, []))

export function pushRecentShape(type) {
  if (!type) return
  recentShapes.value = [type, ...recentShapes.value.filter((t) => t !== type)].slice(0, MAX)
  writeJson(KEY, recentShapes.value)
}
