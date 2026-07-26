// App-wide user settings (home + editor), persisted to localStorage so a choice
// survives reloads and applies on every page. A module-level singleton — like
// useWhiteboardUi — so the home sidebar, the editor toolbar and the boot code all
// read/write ONE source. Dark mode is applied by toggling data-theme="dark" on
// <html>; frappe-ui's preset keys its dark tokens off that selector, so all
// surface/ink/outline chrome recolors automatically (canvas content stays light).

import { reactive, watch } from 'vue'
import { readJson, writeJson } from '@/utils/localStore.js'

const STORAGE_KEY = 'frappe-draw-settings'

const stored = readJson(STORAGE_KEY, {})
const settings = reactive({
  darkMode: Boolean(stored.darkMode),
})

// Reflect the dark-mode flag onto <html> and persist it. Called once at import so
// the theme is right before the app mounts (no flash), then on every change.
function apply() {
  const root = document.documentElement
  if (settings.darkMode) root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
  writeJson(STORAGE_KEY, { darkMode: settings.darkMode })
}

apply()
watch(() => settings.darkMode, apply)

export function useAppSettings() {
  return {
    settings,
    toggleDarkMode: () => (settings.darkMode = !settings.darkMode),
  }
}
