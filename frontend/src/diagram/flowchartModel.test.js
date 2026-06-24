import { describe, it, expect } from 'vitest'
import {
  createFlowchart,
  addFlowchartNode,
  addFlowchartEdge,
  removeFlowchartNode,
  swapNodeType,
  addDecisionBranch,
  removeDecisionBranch,
  spliceNodeOnEdge,
  outgoingEdges,
  incomingEdges,
  flowchartNodeById,
} from './flowchartModel.js'

// Edge endpoints that still reference removed nodes ("dangling").
function danglingEdges(model) {
  const ids = new Set(model.nodes.map((node) => node.id))
  return model.edges.filter((edge) => !ids.has(edge.from.nodeId) || !ids.has(edge.to.nodeId))
}

describe('flowchart model', () => {
  it('starts with a single Start terminator and no edges', () => {
    const model = createFlowchart()
    expect(model.nodes).toHaveLength(1)
    expect(model.nodes[0].nodeType).toBe('terminator')
    expect(model.edges).toHaveLength(0)
    expect(model.direction).toBe('TB')
  })

  it('decision nodes default to Yes/No branches', () => {
    const model = createFlowchart()
    const id = addFlowchartNode(model, 'decision')
    const node = flowchartNodeById(model, id)
    expect(node.branches.map((b) => b.label)).toEqual(['Yes', 'No'])
  })

  it('removing a node removes its touching edges (no dangling)', () => {
    const model = createFlowchart()
    const a = model.nodes[0].id
    const b = addFlowchartNode(model, 'process')
    const c = addFlowchartNode(model, 'process')
    addFlowchartEdge(model, a, b)
    addFlowchartEdge(model, b, c)
    removeFlowchartNode(model, b)
    expect(danglingEdges(model)).toHaveLength(0)
    expect(model.edges).toHaveLength(0)
  })

  it('node-type swap preserves all connected edges', () => {
    const model = createFlowchart()
    const a = model.nodes[0].id
    const b = addFlowchartNode(model, 'process')
    const c = addFlowchartNode(model, 'process')
    addFlowchartEdge(model, a, b)
    addFlowchartEdge(model, b, c)
    swapNodeType(model, b, 'decision')
    expect(flowchartNodeById(model, b).nodeType).toBe('decision')
    expect(incomingEdges(model, b)).toHaveLength(1)
    expect(outgoingEdges(model, b)).toHaveLength(1)
    expect(danglingEdges(model)).toHaveLength(0)
  })

  it('swapping a decision to process re-homes branch edges onto the out port', () => {
    const model = createFlowchart()
    const d = addFlowchartNode(model, 'decision')
    const yes = addFlowchartNode(model, 'process')
    const branchPort = flowchartNodeById(model, d).branches[0].port
    addFlowchartEdge(model, d, yes, { fromPort: branchPort })
    swapNodeType(model, d, 'process')
    expect(outgoingEdges(model, d)[0].from.port).toBe('out')
    expect(flowchartNodeById(model, d).branches).toHaveLength(0)
  })

  it('adds and removes decision branches, cleaning branch edges', () => {
    const model = createFlowchart()
    const d = addFlowchartNode(model, 'decision')
    const port = addDecisionBranch(model, d, 'Maybe')
    expect(flowchartNodeById(model, d).branches).toHaveLength(3)
    const child = addFlowchartNode(model, 'process')
    addFlowchartEdge(model, d, child, { fromPort: port })
    removeDecisionBranch(model, d, port)
    expect(flowchartNodeById(model, d).branches).toHaveLength(2)
    expect(outgoingEdges(model, d)).toHaveLength(0) // branch edge removed
  })

  it('splices a node onto an edge, rewiring A->B into A->new->B', () => {
    const model = createFlowchart()
    const a = model.nodes[0].id
    const b = addFlowchartNode(model, 'process')
    const edgeId = addFlowchartEdge(model, a, b)
    const inserted = spliceNodeOnEdge(model, edgeId, 'process')
    expect(outgoingEdges(model, a).map((e) => e.to.nodeId)).toEqual([inserted])
    expect(outgoingEdges(model, inserted).map((e) => e.to.nodeId)).toEqual([b])
    expect(incomingEdges(model, b).map((e) => e.from.nodeId)).toEqual([inserted])
    expect(danglingEdges(model)).toHaveLength(0)
  })
})
