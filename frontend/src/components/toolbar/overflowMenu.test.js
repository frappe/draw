import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { overflowMenuItems } from './overflowMenu.js'

// Browser-free: assert the editor "…" menu MODEL (labels / icons / the red Delete /
// the Pin↔Unpin toggle / callback wiring), then source-check that the toolbar SFCs
// wire it up — that Rename is gone, and the deferred Move / Version history slots.
// Mirrors ShareMenu.test.js (import the model, string-check the SFC).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const overflowSfc = read('OverflowMenu.vue')
const titleEditor = read('TitleEditor.vue')
const topToolbar = read('TopToolbar.vue')
const moveDialog = read('MoveToDriveDialog.vue')

function build(overrides = {}) {
  return overflowMenuItems({
    isPinned: false,
    driveAvailable: false,
    onShowInfo: () => {},
    onMove: () => {},
    onTogglePin: () => {},
    onDelete: () => {},
    ...overrides,
  })
}

describe('overflow menu model (#111)', () => {
  it('lists Show info · Pin · Delete', () => {
    expect(build().map((i) => i.label)).toEqual(['Show info', 'Pin', 'Delete'])
  })

  it('flips the pin item to Unpin once pinned', () => {
    expect(build({ isPinned: true }).map((i) => i.label)).toEqual([
      'Show info',
      'Unpin',
      'Delete',
    ])
  })

  it('names the pin action Pin / Unpin, matching Home (#233)', () => {
    // Home's tile menu has always used this pair. "Favourite" was the odd one out.
    expect(build().map((i) => i.label)).not.toContain('Favourite')
    expect(build({ isPinned: true }).map((i) => i.label)).not.toContain('Favourite')
  })

  it('marks Delete as the one destructive (red) item', () => {
    const del = build().find((i) => i.label === 'Delete')
    expect(del.theme).toBe('red')
    expect(build().filter((i) => i.theme === 'red')).toHaveLength(1)
  })

  it('gives every item a Dropdown icon', () => {
    expect(build().map((i) => i.icon)).toEqual(['file-text', 'lucide-pin', 'trash-2'])
  })

  it('draws a real pin, not FeatherIcon\'s circle fallback (#233)', () => {
    // Feather has no "pin" — only "map-pin" — and FeatherIcon silently falls back
    // to its "circle" glyph for any name it does not know, which is what shipped.
    // A complete lucide-* class takes the class path instead and cannot fall back.
    const pin = build().find((i) => i.label === 'Pin')
    expect(pin.icon).toBe('lucide-pin')
    expect(build({ isPinned: true }).find((i) => i.label === 'Unpin').icon).toBe('lucide-pin')
  })

  it('offers Move only when Drive is available (Version history stays deferred)', () => {
    // No Drive → no folders to move into, so Move is hidden.
    const withoutDrive = build().map((i) => i.label)
    expect(withoutDrive).not.toContain('Move')

    // Drive present → Move appears, sitting between Show info and the pin toggle.
    const withDrive = build({ driveAvailable: true }).map((i) => i.label)
    expect(withDrive).toEqual(['Show info', 'Move', 'Pin', 'Delete'])

    // Version history has no backing yet, so it never shows either way.
    expect(withoutDrive.some((l) => /version/i.test(l))).toBe(false)
    expect(withDrive.some((l) => /version/i.test(l))).toBe(false)
  })

  it('wires Move to its callback and gives it a folder icon', () => {
    const onMove = vi.fn()
    const move = build({ driveAvailable: true, onMove }).find((i) => i.label === 'Move')
    expect(move.icon).toBe('folder')
    move.onClick()
    expect(onMove).toHaveBeenCalledOnce()
  })

  it('wires each row to its callback', () => {
    const onShowInfo = vi.fn()
    const onTogglePin = vi.fn()
    const onDelete = vi.fn()
    const byLabel = Object.fromEntries(
      build({ onShowInfo, onTogglePin, onDelete }).map((i) => [i.label, i.onClick]),
    )
    byLabel['Show info']()
    byLabel['Pin']()
    byLabel['Delete']()
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

  it('has no Rename row, and leaves no wiring behind it (#232)', () => {
    // The whole path is gone: the menu no longer emits, the toolbar no longer
    // holds a ref to trigger it, and TitleEditor no longer exposes an entry point.
    expect(build().map((i) => i.label)).not.toContain('Rename')
    expect(overflowSfc).not.toContain("emit('rename')")
    expect(topToolbar).not.toContain('titleEditor')
    expect(titleEditor).not.toContain('defineExpose')
  })

  it('leaves the title itself as the way to rename (#232)', () => {
    // Removing the menu row is only safe while clicking the title still edits it.
    expect(titleEditor).toContain('@click="startEditing"')
    expect(titleEditor).toContain('function startEditing')
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

  it('mounts the Move dialog and gates it on Drive availability', () => {
    expect(overflowSfc).toContain('MoveToDriveDialog')
    expect(overflowSfc).toContain('getDriveAvailability')
    expect(overflowSfc).toContain('driveAvailable: driveAvailable.value')
  })
})

// Source-check the Move dialog the way ShareMenu.test.js checks its SFC (node env,
// no DOM mount): it loads folders on open, moves on confirm, emits `moved`, and
// degrades gracefully when Drive is absent.
describe('MoveToDriveDialog (#105)', () => {
  it('loads Home when opened and browses into folders', () => {
    expect(moveDialog).toContain('listDriveFolders')
    expect(moveDialog).toContain('load(null)')
    expect(moveDialog).toContain('function openFolder')
  })

  it('moves into the current folder, then emits moved and closes', () => {
    expect(moveDialog).toContain('moveToDriveFolder(props.diagramName, current.value)')
    expect(moveDialog).toContain("emit('moved'")
    expect(moveDialog).toContain('show.value = false')
  })

  it('degrades gracefully when Drive is unavailable', () => {
    expect(moveDialog).toContain('drive_installed !== false')
    expect(moveDialog).toContain("Frappe Drive isn't available")
    // Move is disabled unless Drive is installed.
    expect(moveDialog).toMatch(/canMove\s*=\s*computed\(\(\)\s*=>\s*driveInstalled\.value/)
  })
})
