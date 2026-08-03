import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { driveBreadcrumbCrumbs } from './driveBreadcrumb.js'

// Browser-free: unit-test the pure drive-vs-static decision, then source-check that
// TopToolbar wires it up (the toolbar has no mount test — mirrors overflowMenu.test.js,
// which string-checks the SFCs instead of mounting them).
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(here, rel), 'utf8')
const topToolbar = read('TopToolbar.vue')

describe('driveBreadcrumbCrumbs (#112)', () => {
  it('returns the folder crumbs when the diagram is registered with a path', () => {
    const res = {
      drive_installed: true,
      registered: true,
      path: [
        { name: 'home-id', title: 'Home' },
        { name: 'folder-id', title: 'Projects' },
      ],
    }
    expect(driveBreadcrumbCrumbs(res)).toEqual([
      { name: 'home-id', title: 'Home' },
      { name: 'folder-id', title: 'Projects' },
    ])
  })

  it('falls back (empty) when Drive is absent / the call errored (null)', () => {
    // getDiagramDrivePath returns null on any error; the toolbar must show the static crumb.
    expect(driveBreadcrumbCrumbs(null)).toEqual([])
    expect(driveBreadcrumbCrumbs(undefined)).toEqual([])
  })

  it('falls back (empty) when the diagram is not registered in Drive', () => {
    expect(driveBreadcrumbCrumbs({ drive_installed: true, registered: false, path: [] })).toEqual([])
  })

  it('falls back (empty) when registered but the path is empty (defensive)', () => {
    expect(driveBreadcrumbCrumbs({ drive_installed: true, registered: true, path: [] })).toEqual([])
  })

  it('drops malformed crumbs missing a name or title', () => {
    const res = {
      registered: true,
      path: [{ name: 'a', title: 'A' }, { name: 'b' }, { title: 'C' }, null],
    }
    expect(driveBreadcrumbCrumbs(res)).toEqual([{ name: 'a', title: 'A' }])
  })
})

describe('TopToolbar Drive-breadcrumb wiring (#112)', () => {
  it('fetches the diagram Drive path and derives the crumbs', () => {
    expect(topToolbar).toContain('getDiagramDrivePath')
    expect(topToolbar).toContain('driveBreadcrumbCrumbs')
    expect(topToolbar).toContain('route.params.name')
  })

  it('renders the Drive crumbs, each opening the folder in Drive', () => {
    expect(topToolbar).toContain('showDriveBreadcrumb')
    expect(topToolbar).toContain('openInDrive(crumb.name)')
    expect(topToolbar).toContain("'/drive/d/'")
  })

  it('keeps the static "Frappe Draw" fallback and the goHome home affordance', () => {
    expect(topToolbar).toContain('Frappe Draw')
    expect(topToolbar).toContain('goHome')
  })
})
