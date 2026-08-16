import { describe, it, expect } from 'vitest'
import {
  mindmapNodeSize,
  mindmapSizeForShape,
  mindmapTextArea,
  NODE_PAD_X,
  NODE_PAD_Y,
  NODE_MIN_WIDTH,
  NODE_MAX_WIDTH,
  LINE_HEIGHT,
  NODE_FONT_SIZE,
} from './mindmapNodeSize.js'

// This module is the contract that stops text escaping a node (#427 item 5) and
// stops branches jumping (item 8): creation, layout, the renderer and the live
// editor all size from here, so the box measured is the box drawn.
describe('mindmapNodeSize', () => {
  it('gives an empty node the resting minimum box', () => {
    expect(mindmapNodeSize({ text: '' })).toEqual({
      w: NODE_MIN_WIDTH,
      h: LINE_HEIGHT + NODE_PAD_Y,
    })
  })

  it('treats missing arguments as an empty node', () => {
    expect(mindmapNodeSize()).toEqual(mindmapNodeSize({ text: '' }))
  })

  it('grows wider with longer text, up to the cap', () => {
    const short = mindmapNodeSize({ text: 'a short label' })
    const longer = mindmapNodeSize({ text: 'a considerably longer label' })
    expect(longer.w).toBeGreaterThan(short.w)
    expect(longer.w).toBeLessThanOrEqual(NODE_MAX_WIDTH)
  })

  it('stops widening at the cap and grows downward instead', () => {
    const capped = mindmapNodeSize({ text: 'w'.repeat(40) })
    const longer = mindmapNodeSize({ text: 'w'.repeat(120) })
    expect(capped.w).toBe(NODE_MAX_WIDTH)
    expect(longer.w).toBe(NODE_MAX_WIDTH)
    expect(longer.h).toBeGreaterThan(capped.h)
  })

  it('adds exactly one line height per wrapped line', () => {
    const one = mindmapNodeSize({ text: 'w'.repeat(20) })
    const two = mindmapNodeSize({ text: `${'w'.repeat(20)} ${'w'.repeat(20)}` })
    expect(two.h - one.h).toBe(LINE_HEIGHT)
  })

  it('keeps an unbreakable word inside a finite box', () => {
    const size = mindmapNodeSize({ text: 'x'.repeat(200) })
    expect(size.w).toBe(NODE_MAX_WIDTH)
    expect(Number.isFinite(size.h)).toBe(true)
    expect(size.h).toBeGreaterThan(LINE_HEIGHT)
  })

  it('scales both axes with the font size', () => {
    const base = mindmapNodeSize({ text: 'idea', fontSize: 14 })
    const bigger = mindmapNodeSize({ text: 'idea', fontSize: 28 })
    expect(bigger.w).toBeGreaterThan(base.w)
    expect(bigger.h).toBeGreaterThan(base.h)
  })

  it('gives a root a larger default box than a child', () => {
    const root = mindmapNodeSize({ text: 'idea', isRoot: true })
    const child = mindmapNodeSize({ text: 'idea', isRoot: false })
    expect(root.h).toBeGreaterThan(child.h)
  })
})

describe('mindmapSizeForShape', () => {
  const shape = (content, size = 16, parentId = 'root') => ({
    text: { content, style: { size } },
    mindmap: { parentId },
  })

  it('measures a shape from its own text and font size', () => {
    expect(mindmapSizeForShape(shape('idea', 16))).toEqual(
      mindmapNodeSize({ text: 'idea', fontSize: 16 }),
    )
  })

  it('measures a parentless shape as a root', () => {
    expect(mindmapSizeForShape(shape('idea', 16, null))).toEqual(
      mindmapNodeSize({ text: 'idea', fontSize: 16, isRoot: true }),
    )
  })

  it('survives a shape with no text block', () => {
    expect(mindmapSizeForShape({})).toEqual(mindmapNodeSize({ text: '', isRoot: true }))
  })

  // #509: the box grew a line at 15 characters and collapsed again at 16, on both
  // sizes the product actually uses. It is swept rather than point-tested because a
  // single length is exactly what the original tests checked and passed.
  it.each([
    ['a node', { fontSize: NODE_FONT_SIZE }],
    ['the root', { isRoot: true }],
    ['the calibrated base', {}],
  ])('never shrinks %s as its label grows', (_label, options) => {
    let previous = 0
    for (let chars = 1; chars <= 60; chars += 1) {
      const { h } = mindmapNodeSize({ text: 'a'.repeat(chars), ...options })
      expect(h).toBeGreaterThanOrEqual(previous)
      previous = h
    }
  })

  it('keeps a label that fits on one line on one line', () => {
    // The width cap is what wraps text; below it the box is one line by construction.
    const oneLine = mindmapNodeSize({ text: 'a', fontSize: NODE_FONT_SIZE }).h
    for (let chars = 1; chars <= 20; chars += 1) {
      expect(mindmapNodeSize({ text: 'a'.repeat(chars), fontSize: NODE_FONT_SIZE }).h).toBe(oneLine)
    }
  })
})

describe('mindmapTextArea', () => {
  it('insets the box evenly on both axes', () => {
    const area = mindmapTextArea({ x: 100, y: 50, w: 140, h: 40 })
    expect(area).toEqual({
      x: 100 + NODE_PAD_X / 2,
      y: 50 + NODE_PAD_Y / 2,
      w: 140 - NODE_PAD_X,
      h: 40 - NODE_PAD_Y,
    })
  })

  it('never returns a collapsed area for a box smaller than its padding', () => {
    const area = mindmapTextArea({ x: 0, y: 0, w: 10, h: 10 })
    expect(area.w).toBeGreaterThan(0)
    expect(area.h).toBeGreaterThan(0)
  })

  it('leaves room for the width the box was measured at', () => {
    const size = mindmapNodeSize({ text: 'a label that wraps somewhere' })
    const area = mindmapTextArea({ x: 0, y: 0, ...size })
    expect(area.w).toBe(size.w - NODE_PAD_X)
  })
})
