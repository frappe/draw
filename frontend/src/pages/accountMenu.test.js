import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #461: the account menu is Trash, Settings, Log out — one group, no divider, no
// Apps. Browser-free node env, so this is source inspection.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'HomeShell.vue'), 'utf8')
const menu = source.slice(source.indexOf('const appMenu'), source.indexOf('const isCreating'))

describe('the account menu (#461)', () => {
  it('offers exactly Trash, Settings and Log out', () => {
    const labels = [...menu.matchAll(/label: '([^']+)'/g)].map(([, label]) => label)
    expect(labels).toEqual(['Trash', 'Settings', 'Log out'])
  })

  // The divider was the boundary between two groups, not a separator anyone added,
  // so one group is what removes it. Going back to two brings the line back.
  it('holds them in one group, which is what leaves no divider', () => {
    expect((menu.match(/group:/g) || []).length).toBe(1)
  })

  // Dropped because the content could not be built, not because the mechanism was
  // missing: the Suite apps are modules inside one `suite` app, so a live list is a
  // single "Frappe Suite" row rather than the Writer / Slides / Sheets reference.
  it('no longer jumps to the apps screen', () => {
    expect(menu).not.toContain("label: 'Apps'")
    expect(menu).not.toContain('/apps')
  })
})
