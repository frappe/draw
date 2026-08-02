import { describe, it, expect, vi } from 'vitest'
import { flowchartKeydown } from './useFlowchartKeys.js'
import { ROLE } from '@/diagram/freeFloating.js'

// A migrated flowchart node is a role-tagged shape and `state.flowchart` is null
// after the #122 flip. These cover the free-floating keyboard branch (phase 3c):
// build a connected node with Enter/D/T/I, remove it with Delete/Backspace. Before
// 3c, flowchartKeydown returned false on a null sub-model and — because the owner is
// still the registered 'flowchart' handler — the shared block delete was suppressed,
// so Delete did nothing at all on a migrated flowchart node.
const fcShape = {
  id: 'f1', role: ROLE.flowchartNode, x: 0, y: 0, w: 150, h: 60,
  flowchart: { nodeType: 'terminator', branches: [] },
}

function fakeStore() {
  return {
    state: { selection: ['f1'], shapes: [fcShape], connectors: [], flowchart: null },
    addFlowchartChildShape: vi.fn(() => 'fNEW'),
    deleteFlowchartShapes: vi.fn(),
    select: vi.fn(),
  }
}

describe('flowchartKeydown — migrated free-floating node (#122 phase 3c)', () => {
  it('Enter adds a connected Process child and selects it', () => {
    const store = fakeStore()
    expect(flowchartKeydown({ key: 'Enter' }, store, {})).toBe(true)
    expect(store.addFlowchartChildShape).toHaveBeenCalledWith('f1', 'process')
    expect(store.select).toHaveBeenCalledWith(['fNEW'])
  })

  it('D / T / I add decision / terminator / inputOutput', () => {
    for (const [key, type] of [['d', 'decision'], ['t', 'terminator'], ['i', 'inputOutput']]) {
      const store = fakeStore()
      flowchartKeydown({ key }, store, {})
      expect(store.addFlowchartChildShape).toHaveBeenCalledWith('f1', type)
    }
  })

  it('Delete removes the selected node (regression: Delete was swallowed pre-3c)', () => {
    const store = fakeStore()
    expect(flowchartKeydown({ key: 'Delete' }, store, {})).toBe(true)
    expect(store.deleteFlowchartShapes).toHaveBeenCalledWith(['f1'])
  })

  it('Backspace also deletes', () => {
    const store = fakeStore()
    flowchartKeydown({ key: 'Backspace' }, store, {})
    expect(store.deleteFlowchartShapes).toHaveBeenCalledWith(['f1'])
  })

  it('consumes an unmapped key without creating a node', () => {
    const store = fakeStore()
    expect(flowchartKeydown({ key: 'x' }, store, {})).toBe(true)
    expect(store.addFlowchartChildShape).not.toHaveBeenCalled()
  })

  it('does not build when more than one node is selected', () => {
    const store = fakeStore()
    store.state.selection = ['f1', 'f2']
    store.state.shapes = [fcShape, { ...fcShape, id: 'f2' }]
    flowchartKeydown({ key: 'Enter' }, store, {})
    expect(store.addFlowchartChildShape).not.toHaveBeenCalled()
  })
})
