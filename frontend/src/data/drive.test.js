import { describe, it, expect, vi } from 'vitest'

// drive.js imports `call` from frappe-ui; stub it so the module loads without the
// vite plugin, and so getDriveAvailability's endpoint/verb can be asserted.
const call = vi.fn()
vi.mock('frappe-ui', () => ({ call: (...args) => call(...args) }))

const { shouldShowInstallDriveBanner, getDriveAvailability, listDriveFolders, moveToDriveFolder } =
  await import('./drive.js')

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

describe('listDriveFolders', () => {
  it('lists Home when no parent is given', async () => {
    const home = { drive_installed: true, current: 'home-id', path: [], folders: [] }
    call.mockReset().mockResolvedValue(home)
    expect(await listDriveFolders()).toBe(home)
    expect(call).toHaveBeenCalledWith('draw.api.drive_integration.list_drive_folders', {
      parent: null,
    })
  })

  it('lists a specific folder when a parent id is given', async () => {
    call.mockReset().mockResolvedValue({ drive_installed: true, current: 'sub', path: [], folders: [] })
    await listDriveFolders('sub')
    expect(call).toHaveBeenCalledWith('draw.api.drive_integration.list_drive_folders', {
      parent: 'sub',
    })
  })
})

describe('moveToDriveFolder', () => {
  it('moves a diagram into the given folder', async () => {
    const res = { drive_installed: true, moved: true, file: 'file-1' }
    call.mockReset().mockResolvedValue(res)
    expect(await moveToDriveFolder('diagram-1', 'folder-2')).toBe(res)
    expect(call).toHaveBeenCalledWith('draw.api.drive_integration.move_to_drive_folder', {
      name: 'diagram-1',
      folder: 'folder-2',
    })
  })

  it('passes a null folder through as "move to Home"', async () => {
    call.mockReset().mockResolvedValue({ drive_installed: true, moved: true, file: 'file-1' })
    await moveToDriveFolder('diagram-1', null)
    expect(call).toHaveBeenCalledWith('draw.api.drive_integration.move_to_drive_folder', {
      name: 'diagram-1',
      folder: null,
    })
  })
})
