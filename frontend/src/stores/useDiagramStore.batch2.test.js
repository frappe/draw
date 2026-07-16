import { describe, it, expect } from 'vitest'
import { createDiagramStore } from './useDiagramStore.js'
import { createDiagramDocument } from '@/diagram/schema.js'
import { flowchartKeydown } from '@/composables/useFlowchartKeys.js'

// Regression tests for demo-hardening batch 2 — the logic-level store fixes.
// (The component/DOM-level fixes in the same batch aren't unit-reachable.)

describe('lastSelectedShape resolves the last-CLICKED shape, not z-order', () => {
  it('follows selection (click) order even when it differs from the shapes array', () => {
    const store = createDiagramStore()
    const a = store.addShape({ x: 0, y: 0 }) // earlier in the shapes array (z-order)
    const b = store.addShape({ x: 200, y: 0 }) // later in the shapes array

    // Click B first, then shift-click A — A is the intended key/reference object.
    store.select([b])
    store.addToSelection([a])

    // Old bug: reference was selectedShapes[last] === B (last in z-order).
    expect(store.lastSelectedShape.id).toBe(a)
  })

  it('is null when nothing is selected', () => {
    const store = createDiagramStore()
    store.addShape({ x: 0, y: 0 })
    expect(store.lastSelectedShape).toBe(null)
  })
})

describe('group() mints unique ids (no Date.now collision)', () => {
  it('gives two consecutive groups distinct groupIds', () => {
    const store = createDiagramStore()
    const a = store.addShape({})
    const b = store.addShape({})
    const c = store.addShape({})
    const d = store.addShape({})

    store.group([a, b])
    store.group([c, d])

    const gid = (id) => store.shapeById(id).groupId
    expect(gid(a)).toBe(gid(b))
    expect(gid(c)).toBe(gid(d))
    expect(gid(a)).not.toBe(gid(c)) // independent groups must not merge
  })
})

describe('deleting a flowchart node prunes the selection', () => {
  it('removes the dead id so keyboard building keeps working', () => {
    const store = createDiagramStore(createDiagramDocument(undefined, 'flowchart'))
    const n1 = store.addFlowchartNode('process', 'A')
    const n2 = store.addFlowchartNode('process', 'B')

    store.select([n1, n2])
    store.removeFlowchartNode(n1)
    expect(store.state.selection).toEqual([n2])

    store.removeFlowchartNodes([n2])
    expect(store.state.selection).toEqual([])
  })
})

describe('keyboard-extend from a decision node uses a labelled branch port', () => {
  it('fills the first free branch (Yes, then No) with its label', () => {
    const store = createDiagramStore(createDiagramDocument(undefined, 'flowchart'))
    const dec = store.addFlowchartNode('decision', 'OK?')

    store.select([dec])
    flowchartKeydown({ key: 'Enter' }, store, null) // → first child via 'yes'
    const m = store.state.flowchart
    const first = m.edges.find((e) => e.from.nodeId === dec)
    expect(first.from.port).toBe('yes')
    expect(first.label).toBe('Yes')

    store.select([dec]) // the create selected the child; re-select the decision
    flowchartKeydown({ key: 'Enter' }, store, null) // → second child via 'no'
    const ports = m.edges
      .filter((e) => e.from.nodeId === dec)
      .map((e) => e.from.port)
      .sort()
    expect(ports).toEqual(['no', 'yes'])
  })
})
