import { describe, it, expect, vi } from 'vitest'

// drive.js imports `call` from frappe-ui; stub it so the module loads without the
// vite plugin, and so getDriveAvailability's endpoint/verb can be asserted.
const call = vi.fn()
vi.mock('frappe-ui', () => ({ call: (...args) => call(...args) }))

const { shouldShowInstallDriveBanner, getDriveAvailability } = await import('./drive.js')

describe('shouldShowInstallDriveBanner', () => {
  it('stays hidden while the status is still loading / unknown', () => {
    // A null status must NOT flash the banner for users who do have Drive.
    expect(shouldShowInstallDriveBanner(null)).toBe(false)
    expect(shouldShowInstallDriveBanner(undefined)).toBe(false)
  })

  it('shows only once Drive is confirmed absent', () => {
    expect(shouldShowInstallDriveBanner({ installed: false, ready: false })).toBe(true)
  })

  it('stays hidden when Drive is available', () => {
    expect(shouldShowInstallDriveBanner({ installed: true, ready: true })).toBe(false)
  })
})

describe('getDriveAvailability', () => {
  it('returns the backend status from is_available', async () => {
    call.mockReset().mockResolvedValue({ installed: false, ready: false })
    expect(await getDriveAvailability()).toEqual({ installed: false, ready: false })
    expect(call).toHaveBeenCalledWith('draw.api.drive_integration.is_available')
  })

  it('returns null (unknown) on error, so no banner flashes', async () => {
    call.mockReset().mockRejectedValue(new Error('network'))
    expect(await getDriveAvailability()).toBeNull()
  })
})
