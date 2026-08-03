import { describe, it, expect, beforeEach, vi } from 'vitest'

// createAndOpenDiagram wires createDiagram + moveToDriveFolder to the router;
// stub both data modules so the logic can be exercised without a network/browser.
const createDiagram = vi.fn()
const moveToDriveFolder = vi.fn()
vi.mock('@/data/diagrams.js', () => ({ createDiagram: (...a) => createDiagram(...a) }))
vi.mock('@/data/drive.js', () => ({ moveToDriveFolder: (...a) => moveToDriveFolder(...a) }))

const { createAndOpenDiagram } = await import('./newDiagram.js')

// A minimal router double capturing the last replace() call.
function makeRouter() {
  return { replace: vi.fn() }
}

describe('createAndOpenDiagram', () => {
  beforeEach(() => {
    createDiagram.mockReset().mockResolvedValue('new-diagram')
    moveToDriveFolder.mockReset().mockResolvedValue({ drive_installed: true, moved: true })
  })

  it('creates one unified diagram and replaces to the Editor when there is no parent', async () => {
    const router = makeRouter()

    const name = await createAndOpenDiagram(router, null)

    expect(name).toBe('new-diagram')
    expect(createDiagram).toHaveBeenCalledTimes(1)
    expect(createDiagram).toHaveBeenCalledWith(undefined, null, 'unified', null)
    // No Drive folder → no move.
    expect(moveToDriveFolder).not.toHaveBeenCalled()
    // `replace` (not `push`) so Back doesn't return to /new and re-create.
    expect(router.replace).toHaveBeenCalledWith({
      name: 'Editor',
      params: { name: 'new-diagram' },
      query: { new: '1' },
    })
  })

  it('moves the new diagram into the parent folder before opening it', async () => {
    const router = makeRouter()

    await createAndOpenDiagram(router, 'folder-2')

    expect(moveToDriveFolder).toHaveBeenCalledWith('new-diagram', 'folder-2')
    expect(router.replace).toHaveBeenCalledWith({
      name: 'Editor',
      params: { name: 'new-diagram' },
      query: { new: '1' },
    })
    // The move must run before we navigate away.
    const moveOrder = moveToDriveFolder.mock.invocationCallOrder[0]
    const replaceOrder = router.replace.mock.invocationCallOrder[0]
    expect(moveOrder).toBeLessThan(replaceOrder)
  })

  it('still opens the diagram when the Drive move fails (best-effort)', async () => {
    const router = makeRouter()
    moveToDriveFolder.mockRejectedValue(new Error('no permission'))

    const name = await createAndOpenDiagram(router, 'folder-2')

    expect(name).toBe('new-diagram')
    // A failed move is non-fatal: the diagram exists in Drive Home and still opens.
    expect(router.replace).toHaveBeenCalledWith({
      name: 'Editor',
      params: { name: 'new-diagram' },
      query: { new: '1' },
    })
  })

  it('throws (and does not navigate) when the server returns no diagram name', async () => {
    const router = makeRouter()
    createDiagram.mockResolvedValue(undefined)

    await expect(createAndOpenDiagram(router, null)).rejects.toThrow()
    expect(router.replace).not.toHaveBeenCalled()
  })
})
