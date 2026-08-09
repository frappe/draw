import { describe, it, expect, vi } from 'vitest'
import { submitOrThrow } from './submit.js'

describe('submitOrThrow', () => {
  it('passes the params through to the call', async () => {
    const call = { submit: vi.fn().mockResolvedValue(undefined), error: null }
    await submitOrThrow(call, { name: 'abc', is_pinned: 1 })
    expect(call.submit).toHaveBeenCalledWith({ name: 'abc', is_pinned: 1 })
  })

  it('resolves when the call reports no error', async () => {
    const call = { submit: async () => {}, error: null }
    await expect(submitOrThrow(call, {})).resolves.toBeUndefined()
  })

  // useCall resolves on failure and parks the error, so the caller would
  // otherwise carry on and report success for a write that never landed.
  it('throws the error the call parked instead of resolving', async () => {
    const error = new Error('Insufficient Permission')
    const call = { submit: async () => {}, error }
    await expect(submitOrThrow(call, {})).rejects.toThrow('Insufficient Permission')
  })
})
