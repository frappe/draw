import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// useShare.js imports frappe-ui at module load; stub it so this browser-free test can
// import the option constants without pulling in frappe-ui's deep (node-broken) paths.
vi.mock('frappe-ui', () => ({ call: () => {}, toast: { success() {}, error() {} } }))

const { GENERAL_ACCESS_OPTIONS, MEMBER_ROLE_OPTIONS } = await import('@/composables/useShare.js')

// The dialog can't be mounted here (this repo keeps unit tests browser-free, node
// env, no @vue/test-utils), so we assert two things instead: the option model the
// dialog renders, and that ShareMenu.vue actually binds that model — a regression
// guard against someone hardcoding the old two-state <select> back into the template.
// This mirrors the Python suite, which likewise inspects source (AST) rather than
// standing up the whole stack.
const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'ShareMenu.vue'),
  'utf8',
)

describe('ShareMenu general-access tiers', () => {
  it('renders the three tiers, each with an icon (lock / building / globe)', () => {
    expect(GENERAL_ACCESS_OPTIONS).toHaveLength(3)
    expect(GENERAL_ACCESS_OPTIONS.map((o) => o.value)).toEqual([
      'restricted',
      'site_users_view',
      'public_view',
    ])
    expect(GENERAL_ACCESS_OPTIONS.map((o) => o.icon)).toEqual(['lock', 'building-2', 'globe'])
  })

  it('is view-only: no edit option on general access', () => {
    expect(GENERAL_ACCESS_OPTIONS.some((o) => /edit/.test(o.value))).toBe(false)
  })

  it('drives the tier menu from the shared option list, with per-tier icons', () => {
    expect(source).toMatch(/v-for="opt in generalAccessOptions"/)
    expect(source).toMatch(/:name="opt\.icon"/)
    expect(source).toContain('share.setGeneralAccess')
  })

  it('does not reintroduce the old two-state public toggle', () => {
    expect(source).not.toContain('value="link"')
    expect(source).not.toContain('accessLevel')
  })
})

describe('ShareMenu per-member options', () => {
  it('offers Can view / Can comment / Can edit as the per-member roles', () => {
    expect(MEMBER_ROLE_OPTIONS.map((o) => o.label)).toEqual([
      'Can view',
      'Can comment',
      'Can edit',
    ])
  })

  it('renders the per-member roles from the shared list and a Remove control', () => {
    expect(source).toMatch(/v-for="r in memberRoleOptions"/)
    expect(source).toMatch(/aria-label="Remove"/)
    expect(source).toContain('share.setMemberRole')
    expect(source).toContain('share.removeMember')
  })
})

describe('ShareMenu Writer layout', () => {
  it('titles the dialog Sharing "<name>"', () => {
    expect(source).toContain('Sharing "')
  })

  it('places General access above the People list', () => {
    expect(source.indexOf('>General access<')).toBeGreaterThanOrEqual(0)
    expect(source.indexOf('>General access<')).toBeLessThan(source.indexOf('>People<'))
  })
})
