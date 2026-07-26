import { describe, it, expect } from 'vitest'
import { isEditingText } from './dom.js'

// Plain objects stand in for event targets — the predicate only reads tagName and
// isContentEditable, so it stays testable in the node environment.
describe('isEditingText', () => {
  it('is true for inputs, textareas and contentEditable elements', () => {
    expect(isEditingText({ tagName: 'INPUT' })).toBe(true)
    expect(isEditingText({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isEditingText({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('is false for ordinary elements and a missing target', () => {
    expect(isEditingText({ tagName: 'DIV' })).toBe(false)
    expect(isEditingText({ tagName: 'svg' })).toBe(false)
    expect(isEditingText(null)).toBe(false)
    expect(isEditingText(undefined)).toBe(false)
  })
})
