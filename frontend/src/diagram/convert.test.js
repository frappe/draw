import { describe, it, expect } from 'vitest'
import { mindmapToFlowchart, flowchartToMindmap, outlineMarkdown } from './convert.js'
import { createMindMap, addChild } from './mindmapModel.js'
import { createFlowchart, addFlowchartNode, addFlowchartEdge } from './flowchartModel.js'

describe('diagram convert', () => {
  it('mind map → flowchart: a node per tree node, edges per parent link', () => {
    const mm = createMindMap('Root')
    const a = addChild(mm, mm.rootId, 'A')
    addChild(mm, a, 'A1')
    addChild(mm, mm.rootId, 'B')
    const fc = mindmapToFlowchart(mm)
    expect(fc.nodes).toHaveLength(4) // Root, A, A1, B
    expect(fc.edges).toHaveLength(3) // Root→A, A→A1, Root→B
    expect(fc.nodes[0].nodeType).toBe('terminator') // root
  })

  it('flowchart → mind map: entry node becomes the root, edges become branches', () => {
    const fc = createFlowchart()
    const start = addFlowchartNode(fc, 'terminator', 'Start', 0, 0)
    const work = addFlowchartNode(fc, 'process', 'Work', 0, 100)
    const ship = addFlowchartNode(fc, 'process', 'Ship', 0, 200)
    addFlowchartEdge(fc, start, work)
    addFlowchartEdge(fc, work, ship)
    const mm = flowchartToMindmap(fc)
    expect(mm.nodes).toHaveLength(3)
    const root = mm.nodes.find((n) => n.id === mm.rootId)
    expect(root.text).toBe('Start')
  })

  it('round-trips a simple chain mind map → flowchart → mind map', () => {
    const mm = createMindMap('Root')
    const a = addChild(mm, mm.rootId, 'A')
    addChild(mm, a, 'B')
    const back = flowchartToMindmap(mindmapToFlowchart(mm))
    expect(back.nodes.map((n) => n.text).sort()).toEqual(['A', 'B', 'Root'])
  })

  it('exports a mind map as an indented Markdown outline', () => {
    const mm = createMindMap('Root')
    const a = addChild(mm, mm.rootId, 'A')
    addChild(mm, a, 'A1')
    const md = outlineMarkdown({ diagramType: 'mindmap', mindmap: mm })
    expect(md).toBe('- Root\n  - A\n    - A1\n')
  })

  it('exports a flowchart as a numbered Markdown outline', () => {
    const fc = createFlowchart()
    const a = addFlowchartNode(fc, 'terminator', 'Start', 0, 0)
    const b = addFlowchartNode(fc, 'process', 'Work', 0, 100)
    addFlowchartEdge(fc, a, b)
    const md = outlineMarkdown({ diagramType: 'flowchart', flowchart: fc })
    expect(md).toBe('1. Start\n2. Work\n')
  })
})
