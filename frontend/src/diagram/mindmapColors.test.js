import { describe, it, expect } from 'vitest'
import { createMindMap, addChild } from './mindmapModel.js'
import { resolveNodeColor, lighten, readableInk, branchPalette } from './mindmapColors.js'

describe('mindmapColors', () => {
  it('gives each first-level branch a distinct palette color', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const b = addChild(model, model.rootId)
    const palette = branchPalette('ocean')
    expect(resolveNodeColor(model, model.nodes.find((n) => n.id === a), 'ocean')).toBe(palette[0])
    expect(resolveNodeColor(model, model.nodes.find((n) => n.id === b), 'ocean')).toBe(palette[1])
  })

  it('descendants inherit the branch color, lightened by depth', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId)
    const child = addChild(model, branch)
    const branchColor = resolveNodeColor(model, model.nodes.find((n) => n.id === branch), 'ocean')
    const childColor = resolveNodeColor(model, model.nodes.find((n) => n.id === child), 'ocean')
    expect(childColor).not.toBe(branchColor) // lightened
    expect(childColor).toBe(lighten(branchColor, 1))
  })

  it('honours an explicit per-node color override', () => {
    const model = createMindMap()
    const branch = addChild(model, model.rootId)
    const node = model.nodes.find((n) => n.id === branch)
    node.color = '#123456'
    expect(resolveNodeColor(model, node, 'ocean')).toBe('#123456')
  })

  it('switches palette with the theme preset', () => {
    const model = createMindMap()
    const a = addChild(model, model.rootId)
    const node = model.nodes.find((n) => n.id === a)
    expect(resolveNodeColor(model, node, 'sunset')).toBe(branchPalette('sunset')[0])
  })

  it('picks readable ink for light vs dark fills', () => {
    expect(readableInk('#FFFFFF')).toBe('#1F2933')
    expect(readableInk('#171717')).toBe('#FFFFFF')
  })
})
