import { describe, it, expect, vi, beforeEach } from 'vitest'

// frappe-ui's `call` and `toast` are the module boundary; stub them so these tests
// exercise the tier logic without a network or a DOM.
const call = vi.fn()
vi.mock('frappe-ui', () => ({
  call: (...args) => call(...args),
  toast: { success() {}, error() {} },
}))

const { useShare, generalAccessLevel, GENERAL_ACCESS_OPTIONS, MEMBER_ROLE_OPTIONS } =
  await import('./useShare.js')
const { reactive } = await import('vue')

// A diagram resource stand-in. `reload()` is what the real one does after a
// successful set_general_access — it re-reads the two tier flags off the row.
//
// It has to be REACTIVE: `generalAccess` is a Vue computed over `resource.doc`, so a
// plain object makes the computed cache its first value forever — the desired-state
// guard then reads a stale tier and skips every later change. That is a defect in the
// double, not in the code under test, and it fails in a way that looks like the code
// is broken.
// `reload()` reflects whatever tier was LAST persisted, read off the call spy — not a
// value the test sets, which would race with the queue it is trying to observe.
function fakeResource({ reloadDelay = 0 } = {}) {
  const resource = reactive({
    doc: { name: 'drawing-1', is_public: 0, all_site_users_can_view: 0 },
    reload: async () => {
      if (reloadDelay) await new Promise((r) => setTimeout(r, reloadDelay))
      const level = call.mock.calls.at(-1)?.[1]?.level
      resource.doc = {
        ...resource.doc,
        is_public: level === 'public_view' ? 1 : 0,
        all_site_users_can_view: level === 'site_users_view' ? 1 : 0,
      }
    },
    setValue: { submit: vi.fn() },
  })
  return resource
}

describe('generalAccessLevel', () => {
  it('reads public_view from the long-standing is_public flag (backward compat)', () => {
    // A diagram made public before the middle tier existed carries is_public only.
    expect(generalAccessLevel({ is_public: 1 })).toBe('public_view')
  })

  it('reads site_users_view from the all_site_users_can_view flag', () => {
    expect(generalAccessLevel({ all_site_users_can_view: 1 })).toBe('site_users_view')
  })

  it('defaults to restricted when neither flag is set', () => {
    expect(generalAccessLevel({})).toBe('restricted')
    expect(generalAccessLevel(undefined)).toBe('restricted')
  })

  it('lets public_view outrank site_users_view when both are set', () => {
    expect(generalAccessLevel({ is_public: 1, all_site_users_can_view: 1 })).toBe('public_view')
  })
})

describe('general-access options (what the dialog renders)', () => {
  it('offers exactly the three tiers, in menu order, each with an icon', () => {
    expect(GENERAL_ACCESS_OPTIONS.map((o) => o.value)).toEqual([
      'restricted',
      'site_users_view',
      'public_view',
    ])
    expect(GENERAL_ACCESS_OPTIONS.map((o) => o.icon)).toEqual(['lucide-lock', 'lucide-building-2', 'lucide-globe'])
    for (const o of GENERAL_ACCESS_OPTIONS) expect(o.label).toBeTruthy()
  })

  it('is view-only — no edit tier is offered on general access', () => {
    const values = GENERAL_ACCESS_OPTIONS.map((o) => o.value)
    expect(values).not.toContain('edit')
    expect(values).not.toContain('public_edit')
  })

  it('offers view / comment / edit as the per-member roles', () => {
    expect(MEMBER_ROLE_OPTIONS.map((o) => o.value)).toEqual(['view', 'comment', 'edit'])
  })
})

describe('setGeneralAccess', () => {
  beforeEach(() => {
    call.mockReset().mockResolvedValue('ok')
  })

  it('opens a diagram to all site users and reflects the tier', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.setGeneralAccess('site_users_view')

    expect(call).toHaveBeenCalledWith('draw.api.share.set_general_access', {
      name: 'drawing-1',
      level: 'site_users_view',
    })
    expect(share.generalAccess.value).toBe('site_users_view')
    expect(share.isPublic.value).toBe(false)
  })

  it('turns on public view and reflects isPublic', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.setGeneralAccess('public_view')

    expect(share.generalAccess.value).toBe('public_view')
    expect(share.isPublic.value).toBe(true)
  })

  it('does nothing when the requested tier is already the current one', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.setGeneralAccess('restricted') // already restricted

    expect(call, 'a no-op change still hit the server').not.toHaveBeenCalled()
  })

  // The regression this composable exists to prevent: switching tiers twice quickly
  // used to drop the second change while the first was still in flight, then snap the
  // control back to the stale value as if it had applied.
  it('keeps a change made while the previous one is still in flight', async () => {
    const resource = fakeResource({ reloadDelay: 30 })
    const share = useShare(resource)

    const first = share.setGeneralAccess('public_view')
    const second = share.setGeneralAccess('restricted') // fired mid-flight, must not be lost
    await Promise.all([first, second])

    expect(call, 'the second change never reached the server').toHaveBeenCalledTimes(2)
    expect(call.mock.calls[0][1].level).toBe('public_view')
    expect(call.mock.calls[1][1].level).toBe('restricted')
    expect(share.generalAccess.value, 'ended in the wrong tier').toBe('restricted')
  })

  it('runs queued changes in the order they were requested', async () => {
    const resource = fakeResource({ reloadDelay: 10 })
    const share = useShare(resource)

    const a = share.setGeneralAccess('public_view')
    const b = share.setGeneralAccess('restricted')
    const c = share.setGeneralAccess('site_users_view')
    await Promise.all([a, b, c])

    expect(call.mock.calls.map((args) => args[1].level)).toEqual([
      'public_view',
      'restricted',
      'site_users_view',
    ])
    expect(share.generalAccess.value).toBe('site_users_view')
  })

  it('does not leave `updating` stuck when the server rejects the change', async () => {
    const resource = fakeResource()
    const share = useShare(resource)
    call.mockRejectedValue(new Error('nope'))

    await share.setGeneralAccess('public_view')

    expect(share.updating.value, 'a failure left the dialog wedged in "updating"').toBe(false)
  })
})

describe('backward-compatible public toggle', () => {
  beforeEach(() => {
    call.mockReset().mockResolvedValue('ok')
  })

  it('setGlobalAccess(true) drives the public_view tier', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.setGlobalAccess(true)

    expect(call.mock.calls[0][1].level).toBe('public_view')
    expect(share.isPublic.value).toBe(true)
  })

  it('toggleGlobalAccess flips restricted <-> public_view', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.toggleGlobalAccess()

    expect(call.mock.calls[0][1].level).toBe('public_view')
  })
})
