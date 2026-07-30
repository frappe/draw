import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// frappe-ui's `call` posts to /api/method/<method>; stub it so the test asserts
// the method and the HTTP verb we depend on, without a network or a browser.
const call = vi.fn()
vi.mock('frappe-ui', () => ({ call: (...args) => call(...args) }))

const { logout } = await import('./session.js')

describe('logout', () => {
  let replace

  beforeEach(() => {
    call.mockReset().mockResolvedValue({})
    replace = vi.fn()
    vi.stubGlobal('window', { location: { replace } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('posts to the logout endpoint instead of navigating to it', async () => {
    await logout()
    expect(call).toHaveBeenCalledWith('logout')
    expect(replace).toHaveBeenCalledWith('/login')
  })

  it('leaves the user in place when the session could not be ended', async () => {
    call.mockRejectedValue(new Error('Not Permitted'))
    await expect(logout()).rejects.toThrow('Not Permitted')
    expect(replace).not.toHaveBeenCalled()
  })
})
