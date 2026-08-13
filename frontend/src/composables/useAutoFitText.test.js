import { describe, it, expect } from 'vitest'
import { fitFontSize } from './useAutoFitText.js'

// #427: auto-fit and ShapeView's :style binding both write the label's inline
// font-size. Auto-fit used to clear it when it had nothing to do, wiping the size
// the binding had written — and Vue only re-writes a style property when the bound
// value changes, so the label sat at the stylesheet default from then on.
describe('fitFontSize', () => {
  it('hands the size back to the base when nothing is being fitted', () => {
    expect(fitFontSize(25)).toBe('25px')
    expect(fitFontSize(25)).not.toBe('')
  })

  it('writes the fitted size while shrinking to fit', () => {
    expect(fitFontSize(25, 18)).toBe('18px')
  })

  // A shape with no text style has no base size to hand back; clearing is then the
  // honest answer, since the binding has nothing of its own on the property.
  it('clears the property only when there is no usable size', () => {
    expect(fitFontSize(undefined)).toBe('')
    expect(fitFontSize(Number.NaN)).toBe('')
  })
})
