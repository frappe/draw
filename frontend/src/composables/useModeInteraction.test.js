import { describe, it, expect } from 'vitest'
import { resolveModeHandlers } from './useModeInteraction.js'

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
