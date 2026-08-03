import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { overflowMenuItems } from './overflowMenu.js'

// Browser-free: assert the editor "…" menu MODEL (labels / icons / the red Delete /
// the Favourite↔Unpin toggle / callback wiring), then source-check that the toolbar
// SFCs wire it up — the inline TitleEditor rename path and the deferred Move / Version
// history slots. Mirrors ShareMenu.test.js (import the model, string-check the SFC).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const overflowSfc = read('OverflowMenu.vue')
const titleEditor = read('TitleEditor.vue')
const topToolbar = read('TopToolbar.vue')

function build(overrides = {}) {
  return overflowMenuItems({
    isPinned: false,
    onRename: () => {},
    onShowInfo: () => {},
    onTogglePin: () => {},
    onDelete: () => {},
    ...overrides,
  })
}

describe('overflow menu model (#111)', () => {
  it('lists Rename · Show info · Favourite · Delete', () => {
    expect(build().map((i) => i.label)).toEqual(['Rename', 'Show info', 'Favourite', 'Delete'])
  })

  it('flips the pin item to Unpin once pinned', () => {
    expect(build({ isPinned: true }).map((i) => i.label)).toEqual([
      'Rename',
      'Show info',
      'Unpin',
      'Delete',
    ])
  })

  it('marks Delete as the one destructive (red) item', () => {
    const del = build().find((i) => i.label === 'Delete')
    expect(del.theme).toBe('red')
    expect(build().filter((i) => i.theme === 'red')).toHaveLength(1)
  })

  it('gives every item a Dropdown icon', () => {
    expect(build().map((i) => i.icon)).toEqual(['edit-2', 'file-text', 'pin', 'trash-2'])
  })

  it('does not surface the deferred Move / Version history actions', () => {
    const labels = build({ isPinned: true }).map((i) => i.label)
    expect(labels.some((l) => /move|version/i.test(l))).toBe(false)
  })

  it('wires each row to its callback', () => {
    const onRename = vi.fn()
    const onShowInfo = vi.fn()
    const onTogglePin = vi.fn()
    const onDelete = vi.fn()
    const byLabel = Object.fromEntries(
      build({ onRename, onShowInfo, onTogglePin, onDelete }).map((i) => [i.label, i.onClick]),
    )
    byLabel['Rename']()
    byLabel['Show info']()
    byLabel['Favourite']()
    byLabel['Delete']()
    expect(onRename).toHaveBeenCalledOnce()
    expect(onShowInfo).toHaveBeenCalledOnce()
    expect(onTogglePin).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
  })
})

describe('overflow menu wiring', () => {
  it('OverflowMenu builds its Dropdown from the shared model', () => {
    expect(overflowSfc).toContain('overflowMenuItems')
    expect(overflowSfc).toContain(':options="menuItems"')
  })

  it('Rename re-enters the inline TitleEditor (no duplicate rename dialog)', () => {
    // OverflowMenu delegates rename upward; TitleEditor exposes the entry point;
    // TopToolbar connects the two.
    expect(overflowSfc).toContain("emit('rename')")
    expect(titleEditor).toContain('defineExpose({ startEditing })')
    expect(topToolbar).toContain('titleEditor?.startEditing()')
  })

  it('Delete moves the diagram to Trash and leaves the editor', () => {
    expect(overflowSfc).toContain('is_trashed: 1')
    expect(overflowSfc).toContain("router.push({ name: 'Home' })")
  })

  it('Favourite toggles is_pinned on the diagram', () => {
    expect(overflowSfc).toMatch(/is_pinned: isPinned\.value \? 0 : 1/)
  })

  it('reuses the ShareMenu route-param loadDiagram pattern (prop-light toolbar)', () => {
    expect(overflowSfc).toContain('loadDiagram(route.params.name)')
  })
})
