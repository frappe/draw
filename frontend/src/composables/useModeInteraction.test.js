import { describe, it, expect } from 'vitest'
import {
  resolveModeHandlers,
  registerModeInteraction,
  unregisterModeInteraction,
} from './useModeInteraction.js'

// The pure routing core of the surface-interaction seam (canvas unification
// Phase 2). Legacy single-type documents register exactly one surface layer, so
// the resolver must return it unchanged; the unified canvas registers several and
// routes by the active tool.

const wb = { id: 'wb' }
const fc = { id: 'fc' }

describe('resolveModeHandlers', () => {
  it('returns null when nothing is registered (shared fallback handles it)', () => {
    expect(resolveModeHandlers({}, 'select')).toBeNull()
    expect(resolveModeHandlers(undefined, 'pen')).toBeNull()
  })

  it('returns the sole registrant regardless of tool (legacy single-type)', () => {
    expect(resolveModeHandlers({ whiteboard: wb }, 'select')).toBe(wb)
    expect(resolveModeHandlers({ whiteboard: wb }, 'pen')).toBe(wb)
    expect(resolveModeHandlers({ flowchart: fc }, 'select')).toBe(fc)
    expect(resolveModeHandlers({ flowchart: fc }, 'anything')).toBe(fc)
  })

  it('routes unambiguous whiteboard tools to the whiteboard layer when several are registered', () => {
    const reg = { whiteboard: wb, flowchart: fc }
    for (const tool of ['pen', 'highlighter', 'eraser', 'sticky', 'table', 'laser']) {
      expect(resolveModeHandlers(reg, tool)).toBe(wb)
    }
  })

  it('routes block-shared tools (line/text/image) and select to the other registrant', () => {
    const reg = { whiteboard: wb, flowchart: fc }
    // 'line'/'text'/'image' collide with block on a shared canvas — block owns them.
    for (const tool of ['select', 'hand', 'line', 'text', 'image']) {
      expect(resolveModeHandlers(reg, tool)).toBe(fc)
    }
  })
})

// Register/detach lifecycle. Two components can hold the same layer key across one
// render: entering a flowchart frame on the unified canvas swaps the frame's
// read-only FlowchartLayer for the focus-mode one, and Vue mounts the incoming
// component BEFORE unmounting the outgoing one. A blind delete in the outgoing
// unmount hook therefore removed the incoming instance's handlers, leaving the
// registry empty — delegatesSurface() went false and nodes would not drag inside a
// focused frame at all.
describe('registerModeInteraction / unregisterModeInteraction', () => {
  const registry = (value = {}) => ({ value })

  it('installs and removes an entry', () => {
    const ref = registry()
    registerModeInteraction(ref, 'flowchart', fc)
    expect(ref.value.flowchart).toBe(fc)
    unregisterModeInteraction(ref, 'flowchart', fc)
    expect(ref.value.flowchart).toBeUndefined()
  })

  it('reassigns the ref so watchers react rather than mutating in place', () => {
    const ref = registry()
    const before = ref.value
    registerModeInteraction(ref, 'flowchart', fc)
    expect(ref.value).not.toBe(before)
  })

  // The race itself.
  it('does not remove an entry another instance installed under the same key', () => {
    const ref = registry()
    const outgoing = { id: 'outgoing' }
    const incoming = { id: 'incoming' }

    registerModeInteraction(ref, 'flowchart', outgoing)
    registerModeInteraction(ref, 'flowchart', incoming) // new layer mounts first
    unregisterModeInteraction(ref, 'flowchart', outgoing) // old layer then unmounts

    expect(ref.value.flowchart, 'the incoming layer lost its registration').toBe(incoming)
  })

  it('tolerates a missing registry and an already-detached key', () => {
    expect(() => unregisterModeInteraction(null, 'flowchart', fc)).not.toThrow()
    const ref = registry()
    expect(() => unregisterModeInteraction(ref, 'flowchart', fc)).not.toThrow()
  })
})
