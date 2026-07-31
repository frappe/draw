import { describe, it, expect, vi, beforeEach } from 'vitest'

// frappe-ui's `call` and `toast` are the module boundary; stub them so these tests
// exercise the queueing logic without a network or a DOM.
const call = vi.fn()
vi.mock('frappe-ui', () => ({
  call: (...args) => call(...args),
  toast: { success() {}, error() {} },
}))

const { useShare } = await import('./useShare.js')
const { reactive } = await import('vue')

// A diagram resource stand-in. `reload()` is what the real one does after a
// successful set_public, and it is the slow part the old code dropped changes during.
//
// It has to be REACTIVE: `isPublic` is a Vue computed over `resource.doc`, so a plain
// object makes the computed cache its first value forever — the desired-state guard
// then reads a stale `isPublic` and skips every later change. That is a defect in the
// double, not in the code under test, and it fails in a way that looks like the code
// is broken.
// `reload()` reflects whatever was LAST persisted, read off the call spy — not a
// value the test sets, which would race with the queue it is trying to observe.
function fakeResource({ reloadDelay = 0 } = {}) {
  const resource = reactive({
    doc: { name: 'drawing-1', is_public: 0 },
    reload: async () => {
      if (reloadDelay) await new Promise((r) => setTimeout(r, reloadDelay))
      const lastEnabled = call.mock.calls.at(-1)?.[1]?.enabled ?? 0
      resource.doc = { ...resource.doc, is_public: lastEnabled }
    },
    setValue: { submit: vi.fn() },
  })
  return resource
}

describe('setGlobalAccess', () => {
  beforeEach(() => {
    call.mockReset().mockResolvedValue({})
  })

  it('turns public access on and reflects it', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.setGlobalAccess(true)

    expect(call).toHaveBeenCalledWith('draw.api.share.set_public', { name: 'drawing-1', enabled: 1 })
    expect(share.isPublic.value).toBe(true)
  })

  it('does nothing when the requested state is already the current one', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.setGlobalAccess(false) // already restricted

    expect(call, 'a no-op change still hit the server').not.toHaveBeenCalled()
  })

  // The regression. Switching to "anyone with the link" and straight back to
  // "restricted" used to drop the second change: toggleGlobalAccess returned early
  // while `updating` was true, so the user's last instruction was discarded and the
  // dropdown snapped back to the stale value as if it had applied.
  it('keeps a change made while the previous one is still in flight', async () => {
    const resource = fakeResource({ reloadDelay: 30 })
    const share = useShare(resource)

    const first = share.setGlobalAccess(true)
    const second = share.setGlobalAccess(false) // fired mid-flight, must not be lost
    await Promise.all([first, second])

    expect(call, 'the second change never reached the server').toHaveBeenCalledTimes(2)
    expect(call.mock.calls[0][1].enabled).toBe(1)
    expect(call.mock.calls[1][1].enabled).toBe(0)
    expect(share.isPublic.value, 'ended in the wrong state').toBe(false)
  })

  it('runs queued changes in the order they were requested', async () => {
    const resource = fakeResource({ reloadDelay: 10 })
    const share = useShare(resource)

    const a = share.setGlobalAccess(true)
    const b = share.setGlobalAccess(false)
    const c = share.setGlobalAccess(true)
    await Promise.all([a, b, c])

    expect(call.mock.calls.map((args) => args[1].enabled)).toEqual([1, 0, 1])
  })

  it('does not leave `updating` stuck when the server rejects the change', async () => {
    const resource = fakeResource()
    const share = useShare(resource)
    call.mockRejectedValue(new Error('nope'))

    await share.setGlobalAccess(true)

    expect(share.updating.value, 'a failure left the dialog wedged in "updating"').toBe(false)
  })

  it('toggleGlobalAccess still flips the current value', async () => {
    const resource = fakeResource()
    const share = useShare(resource)

    await share.toggleGlobalAccess()

    expect(call.mock.calls[0][1].enabled).toBe(1)
  })
})
