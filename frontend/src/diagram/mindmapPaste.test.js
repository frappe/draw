import { describe, it, expect } from 'vitest'
import { parseIndentedText, buildSubtree, looksLikeOutline } from './mindmapPaste.js'
import { createMindMap, childrenOf, nodeById } from './mindmapModel.js'

describe('mindmapPaste', () => {
  it('parses indentation into dense levels', () => {
    const items = parseIndentedText('Fruit\n  Apple\n  Banana\nVeg\n  Carrot')
    expect(items).toEqual([
      { text: 'Fruit', level: 0 },
      { text: 'Apple', level: 1 },
      { text: 'Banana', level: 1 },
      { text: 'Veg', level: 0 },
      { text: 'Carrot', level: 1 },
    ])
  })

  it('strips bullet markers and blank lines', () => {
    const items = parseIndentedText('- One\n\n  * Two\n\t+ Three')
    expect(items.map((i) => i.text)).toEqual(['One', 'Two', 'Three'])
  })

  it('treats tabs and uneven spaces as nesting', () => {
    const items = parseIndentedText('A\n\tB\n\t\tC\n\tD')
    expect(items.map((i) => i.level)).toEqual([0, 1, 2, 1])
  })

  it('builds a subtree under the target node', () => {
    const model = createMindMap()
    const items = parseIndentedText('Fruit\n  Apple\n  Banana\nVeg')
    const created = buildSubtree(model, model.rootId, items)
    expect(created).toHaveLength(4)
    const topLevel = childrenOf(model, model.rootId)
    expect(topLevel.map((n) => n.text)).toEqual(['Fruit', 'Veg'])
    const fruit = topLevel[0]
    expect(childrenOf(model, fruit.id).map((n) => n.text)).toEqual(['Apple', 'Banana'])
    expect(nodeById(model, fruit.id).depth).toBe(1)
  })

  it('detects outline-shaped clipboard text', () => {
    expect(looksLikeOutline('one\ntwo')).toBe(true)
    expect(looksLikeOutline('- single bullet')).toBe(true)
    expect(looksLikeOutline('just a phrase')).toBe(false)
  })
})
