import { describe, it, expect } from 'vitest'
import { errorMessage, isPermissionError } from './errorText.js'

// The shape frappe-ui's frappeRequest throws for a refused write: `exc_type` plus
// `messages` from the server, and a `message` that is the URL + exception name.
const permissionError = {
  exc_type: 'PermissionError',
  messages: ['No permission for Draw Diagram'],
  message: '/api/method/frappe.client.insert PermissionError No permission for Draw Diagram',
  response: { status: 403 },
}

describe('isPermissionError', () => {
  it('recognises a PermissionError and a bare 403', () => {
    expect(isPermissionError(permissionError)).toBe(true)
    expect(isPermissionError({ response: { status: 403 } })).toBe(true)
  })

  it('is false for other failures and for no error at all', () => {
    expect(isPermissionError({ exc_type: 'ValidationError' })).toBe(false)
    expect(isPermissionError(undefined)).toBe(false)
  })
})

describe('errorMessage', () => {
  it('answers a permission failure with what the user can do about it (#174)', () => {
    // Not the server's "No permission for Draw Diagram", which names a doctype the
    // user has never heard of and no next step.
    expect(errorMessage(permissionError)).toMatch(/administrator/i)
  })

  it('prefers the server messages for any other failure', () => {
    const error = { messages: ['Title is required', 'Fix it'], message: 'Request failed' }
    expect(errorMessage(error)).toBe('Title is required\nFix it')
  })

  it('falls back to the error message, then to the generic line', () => {
    expect(errorMessage({ messages: [], message: 'Network error' })).toBe('Network error')
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage(undefined)).toMatch(/something went wrong/i)
    expect(errorMessage(undefined, 'Could not save')).toBe('Could not save')
  })
})
