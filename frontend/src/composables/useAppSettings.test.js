import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'

// The store is a module-level singleton that reads/writes localStorage at import,
// so each test installs a fresh Map-backed store (the node env has none) and
// resets the module registry — a second import then stands in for a page reload.
const original = globalThis.localStorage

function installStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  }
}

beforeEach(() => {
  installStorage()
  vi.resetModules()
})

afterEach(() => {
  globalThis.localStorage = original
})

describe('useAppSettings', () => {
  it('starts on the current app defaults (slate, no background, text children)', async () => {
    const { useAppSettings } = await import('./useAppSettings.js')
    const { settings } = useAppSettings()
    expect(settings.defaultThemePreset).toBe('slate')
    expect(settings.defaultCanvasBackground).toBe(null)
    expect(settings.mindmapChildStyle).toBe('text')
  })

  it('persists a changed value and reloads it on a fresh import', async () => {
    const first = await import('./useAppSettings.js')
    first.useAppSettings().settings.defaultThemePreset = 'ocean'
    first.useAppSettings().settings.defaultCanvasBackground = '#F5F5F5'
    first.useAppSettings().settings.mindmapChildStyle = 'shape'
    await nextTick() // flush the deep watcher → writeJson

    expect(JSON.parse(globalThis.localStorage.getItem('frappe-draw-settings'))).toEqual({
      defaultThemePreset: 'ocean',
      defaultCanvasBackground: '#F5F5F5',
      mindmapChildStyle: 'shape',
    })

    // A fresh module (new singleton) hydrates from the SAME storage — a reload.
    vi.resetModules()
    const second = await import('./useAppSettings.js')
    expect(second.useAppSettings().settings.defaultThemePreset).toBe('ocean')
    expect(second.useAppSettings().settings.defaultCanvasBackground).toBe('#F5F5F5')
    expect(second.useAppSettings().settings.mindmapChildStyle).toBe('shape')
  })

  it('resetSettings restores the defaults', async () => {
    const mod = await import('./useAppSettings.js')
    mod.useAppSettings().settings.defaultThemePreset = 'violet'
    mod.useAppSettings().settings.defaultCanvasBackground = '#FFFFFF'
    mod.useAppSettings().settings.mindmapChildStyle = 'shape'
    mod.resetSettings()
    expect(mod.useAppSettings().settings.defaultThemePreset).toBe('slate')
    expect(mod.useAppSettings().settings.defaultCanvasBackground).toBe(null)
    expect(mod.useAppSettings().settings.mindmapChildStyle).toBe('text')
  })
})
