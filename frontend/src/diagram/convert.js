// Convert between mind map and flowchart, and export either (plus block /
// whiteboard) as a Markdown outline (spec 13.5). Pure functions — the store wraps
// the model swaps in one history step so a convert is undoable.

import { createFlowchart, addFlowchartNode, addFlowchartEdge, orderedFlowNodes, stripStepNumber } from './flowchartModel.js'
import { tidyLayout } from './flowchartLayout.js'
import { createMindMap, addChild, childrenOf } from './mindmapModel.js'

// Mind map → flowchart: the root becomes a terminator, every other node a
// process; parent→child links become flow edges. Tidy lays the nodes out.
export function mindmapToFlowchart(mindmap) {
  const fc = createFlowchart('TB')
  const idMap = {}
  for (const node of mindmap.nodes) {
    const type = node.id === mindmap.rootId ? 'terminator' : 'process'
    idMap[node.id] = addFlowchartNode(fc, type, node.text || '', 0, 0)
  }
  for (const node of mindmap.nodes) {
    if (node.parentId && idMap[node.parentId]) addFlowchartEdge(fc, idMap[node.parentId], idMap[node.id])
  }
  tidyLayout(fc)
  return fc
}

// Flowchart → mind map: the entry node (no incoming edge) becomes the root; a BFS
// over outgoing edges rebuilds the tree (cycles are visited once).
export function flowchartToMindmap(flowchart) {
  const incoming = new Set(flowchart.edges.map((e) => e.to.nodeId))
  const root = flowchart.nodes.find((n) => !incoming.has(n.id)) || flowchart.nodes[0]
  const mm = createMindMap(root ? root.text || 'Root' : 'Root')
  if (!root) return mm
  const idMap = { [root.id]: mm.rootId }
  const visited = new Set([root.id])
  const queue = [root.id]
  while (queue.length) {
    const cur = queue.shift()
    for (const edge of flowchart.edges.filter((e) => e.from.nodeId === cur)) {
      const childId = edge.to.nodeId
      if (visited.has(childId)) continue
      visited.add(childId)
      const node = flowchart.nodes.find((n) => n.id === childId)
      idMap[childId] = addChild(mm, idMap[cur], node?.text || '')
      queue.push(childId)
    }
  }
  return mm
}

// A Markdown outline for the document, dispatched by type.
export function outlineMarkdown(doc) {
  if (doc.diagramType === 'mindmap' && doc.mindmap) return mindmapOutline(doc.mindmap)
  if (doc.diagramType === 'flowchart' && doc.flowchart) return flowchartOutline(doc.flowchart)
  if (doc.diagramType === 'whiteboard' && doc.whiteboard) return listOutline(stickyTexts(doc))
  return listOutline((doc.shapes || []).map((s) => s.text?.content).filter(Boolean))
}

// Indented bullets following the tree, depth = nesting.
function mindmapOutline(mm) {
  const lines = []
  const walk = (id, depth) => {
    const node = mm.nodes.find((n) => n.id === id)
    if (!node) return
    lines.push(`${'  '.repeat(depth)}- ${node.text || ''}`.trimEnd())
    for (const child of childrenOf(mm, id)) walk(child.id, depth + 1)
  }
  walk(mm.rootId, 0)
  return lines.join('\n') + '\n'
}

// Numbered steps in flow order (junctions skipped); decision labels noted.
function flowchartOutline(fc) {
  let i = 0
  const lines = orderedFlowNodes(fc)
    .filter((n) => n.nodeType !== 'connector')
    .map((n) => {
      i += 1
      const text = stripStepNumber(n.text) || `Step ${i}`
      return `${i}. ${text}`
    })
  return lines.join('\n') + '\n'
}

function stickyTexts(doc) {
  return (doc.whiteboard.stickyNotes || []).map((n) => n.text).filter(Boolean)
}

function listOutline(items) {
  if (!items.length) return '- (empty)\n'
  return items.map((t) => `- ${t}`).join('\n') + '\n'
}
