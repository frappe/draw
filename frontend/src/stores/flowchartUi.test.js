import { describe, it, expect, beforeEach } from 'vitest'
import { flowchartUi, requestFlowchartEdit, endFlowchartEdit, resetFlowchartUi } from './flowchartUi.js'

// flowchartUi is a module singleton, so a leftover editingId would follow an
// in-place document swap into the next document — where the same node id can name a
// different node — and re-open the inline editor on it (finding C2). resetFlowchartUi
// is called at each document load to prevent that.
describe('flowchartUi', () => {
  beforeEach(() => resetFlowchartUi())

  it('resetFlowchartUi clears a pending inline edit', () => {
    requestFlowchartEdit('f3')
    expect(flowchartUi.editingId).toBe('f3')

    resetFlowchartUi()

    expect(flowchartUi.editingId).toBeNull()
  })

  it('endFlowchartEdit only clears when it owns the id (or no id is given)', () => {
    requestFlowchartEdit('f3')
    endFlowchartEdit('other-node') // a different node ending its (non-existent) edit
    expect(flowchartUi.editingId, 'must not clear an edit it does not own').toBe('f3')

    endFlowchartEdit('f3')
    expect(flowchartUi.editingId).toBeNull()
  })
})
