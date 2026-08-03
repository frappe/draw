// App-wide user settings for Frappe Draw, persisted to localStorage so a choice
// survives reloads and applies on every page. A module-level singleton — like
// useWhiteboardUi — so the home sidebar and new-diagram creation read/write ONE
// source. These are document DEFAULTS for new diagrams, never a chrome theme:
// the app is always light (dark mode was removed in #91), so nothing here ever
// touches data-theme or recolours the UI.

import { reactive, watch } from 'vue'
import { readJson, writeJson } from '@/utils/localStore.js'
import { DEFAULT_THEME_PRESET } from '@/diagram/theme.js'

const STORAGE_KEY = 'frappe-draw-settings'

// Defaults MUST match the app's current behaviour so an untouched install
// regresses nothing: a new diagram starts on the SLATE preset (theme.js
// DEFAULT_THEME_PRESET) with NO canvas background — null renders white in the
// editor but exports transparent (schema.js NO_COLOR).
const DEFAULTS = {
  defaultThemePreset: DEFAULT_THEME_PRESET,
  defaultCanvasBackground: null,
}

// Persisted values merge OVER the defaults, so a key added in a later release
// still gets its default when an older stored object lacks it.
const stored = readJson(STORAGE_KEY, {})
const settings = reactive({ ...DEFAULTS, ...stored })

// Persist the whole object on any change. Deep so a future nested setting is
// caught too; today's two values are a string and null.
watch(settings, () => writeJson(STORAGE_KEY, { ...settings }), { deep: true })

export function useAppSettings() {
  return { settings }
}

// Restore every setting to its default. Assign in place so the singleton (and its
// watcher) stay the same object — the change re-persists the cleared values.
export function resetSettings() {
  Object.assign(settings, DEFAULTS)
}
