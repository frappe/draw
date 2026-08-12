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
  it('starts on the current app defaults (slate, no background, boxed nodes #260)', async () => {
    const { useAppSettings } = await import('./useAppSettings.js')
    const { settings } = useAppSettings()
    expect(settings.defaultThemePreset).toBe('slate')
    expect(settings.defaultCanvasBackground).toBe(null)
    // #260: every node defaults to a boxed monochrome node (border + fill on),
    // centred — kept separately for parent and child. #427 item 6: a child's
    // corners default rounder than the parent's, for a softer brainstorm look.
    expect(settings.mindmapNodeStyle.child).toEqual({ border: true, fill: true, curve: 'high', align: 'center' })
    expect(settings.mindmapNodeStyle.parent).toEqual({ border: true, fill: true, curve: 'moderate', align: 'center' })
  })

  it('persists a changed value and reloads it on a fresh import', async () => {
    const first = await import('./useAppSettings.js')
    first.useAppSettings().settings.defaultThemePreset = 'ocean'
    first.useAppSettings().settings.defaultCanvasBackground = '#F5F5F5'
    first.useAppSettings().settings.mindmapNodeStyle.child.curve = 'none'
    await nextTick() // flush the deep watcher → writeJson

    const persisted = JSON.parse(globalThis.localStorage.getItem('frappe-draw-settings'))
    expect(persisted.defaultThemePreset).toBe('ocean')
    expect(persisted.defaultCanvasBackground).toBe('#F5F5F5')
    expect(persisted.mindmapNodeStyle.child.curve).toBe('none')

    // A fresh module (new singleton) hydrates from the SAME storage — a reload.
    vi.resetModules()
    const second = await import('./useAppSettings.js')
    expect(second.useAppSettings().settings.defaultThemePreset).toBe('ocean')
    expect(second.useAppSettings().settings.defaultCanvasBackground).toBe('#F5F5F5')
    expect(second.useAppSettings().settings.mindmapNodeStyle.child.curve).toBe('none')
  })

  it('resetSettings restores the defaults', async () => {
    const mod = await import('./useAppSettings.js')
    mod.useAppSettings().settings.defaultThemePreset = 'violet'
    mod.useAppSettings().settings.defaultCanvasBackground = '#FFFFFF'
    mod.useAppSettings().settings.mindmapNodeStyle.child.fill = false
    mod.resetSettings()
    expect(mod.useAppSettings().settings.defaultThemePreset).toBe('slate')
    expect(mod.useAppSettings().settings.defaultCanvasBackground).toBe(null)
    expect(mod.useAppSettings().settings.mindmapNodeStyle.child.fill).toBe(true)
  })
})
