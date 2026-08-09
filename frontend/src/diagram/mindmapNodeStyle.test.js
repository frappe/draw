import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NODE_STYLE,
  isShaped,
  curveRadius,
  nodeColors,
  borderProp,
  connectorColor,
  CONNECTOR_GRAY,
  hasFill,
  hasBorder,
} from './mindmapNodeStyle.js'

describe('mindmapNodeStyle', () => {
  it('defaults to a boxed monochrome node (#260)', () => {
    expect(DEFAULT_NODE_STYLE).toEqual({ border: true, fill: true, curve: 'moderate', align: 'center' })
    expect(isShaped(DEFAULT_NODE_STYLE)).toBe(true)
  })

  it('treats a node with neither border nor fill as unshaped (transparent text)', () => {
    expect(isShaped({ border: false, fill: false })).toBe(false)
    expect(isShaped({ border: true, fill: false })).toBe(true)
    expect(isShaped({ border: false, fill: true })).toBe(true)
  })

  it('maps corner curve to a radius', () => {
    expect(curveRadius('none')).toBe(0)
    expect(curveRadius('moderate')).toBe(8)
    expect(curveRadius('high')).toBe(20)
    expect(curveRadius(undefined)).toBe(8) // moderate fallback
  })

  it('resolves the default monochrome gray fill/border/ink', () => {
    expect(nodeColors(DEFAULT_NODE_STYLE)).toEqual({
      fill: '#F3F3F3',
      border: '#C7C7C7',
      ink: '#1F2933',
      shaped: true,
    })
  })

  it('lets an explicit override colour the border while the fill stays gray', () => {
    const colors = nodeColors(DEFAULT_NODE_STYLE, '#E03636')
    expect(colors.border).toBe('#E03636')
    expect(colors.fill).toBe('#F3F3F3')
  })

  it('drops the fill and/or border when the style turns them off', () => {
    expect(nodeColors({ border: true, fill: false })).toMatchObject({ fill: 'none', border: '#C7C7C7' })
    expect(nodeColors({ border: false, fill: true })).toMatchObject({ fill: '#F3F3F3', border: null })
  })

  it('renders border-off as a transparent zero-width stroke (geometry unchanged)', () => {
    expect(borderProp(null, 1.5)).toEqual({ color: 'transparent', width: 0, dash: 'solid' })
    expect(borderProp('#C7C7C7', 2)).toEqual({ color: '#C7C7C7', width: 2, dash: 'solid' })
  })

  it('follows the child colour for the branch connector, gray by default (#272)', () => {
    expect(connectorColor()).toBe(CONNECTOR_GRAY)
    expect(connectorColor('#0289F7')).toBe('#0289F7')
  })

  it('detects a visible fill / border so the picker can keep shaped correct (#274)', () => {
    expect(hasFill({ fill: '#F3F3F3' })).toBe(true)
    expect(hasFill({ fill: 'none' })).toBe(false)
    expect(hasFill({})).toBe(false)
    expect(hasBorder({ border: { color: '#C7C7C7', width: 1.5 } })).toBe(true)
    expect(hasBorder({ border: { color: 'transparent', width: 0 } })).toBe(false)
    expect(hasBorder({ border: { color: '#C7C7C7', width: 0 } })).toBe(false)
    expect(hasBorder({})).toBe(false)
  })
})
