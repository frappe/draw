import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #272: a mind-map branch connector is STRUCTURAL — not independently selectable,
// labelable or deletable — and its colour is derived from the child node's border
// (defaulting to gray for a border-less node), not a stored style. ConnectorView
// can't mount in the node env, so pin the wiring by source inspection (house
// pattern, cf. insertsInView.test.js).
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './ConnectorView.vue'),
  'utf8',
)

describe('mind-map branch connectors are structural (#272)', () => {
  it('identifies a branch by the mindmap-branch role', () => {
    expect(src).toContain('const isBranch = computed(() => props.connector.role === ROLE.mindmapBranch)')
  })

  it('renders no clickable hit path for a branch (non-selectable → no menu/delete)', () => {
    // The wide invisible hit path is the only thing that selects a connector by
    // click; it is gated out for branches.
    expect(src).toMatch(/<path v-if="!isBranch"[^>]*@click="onConnectorClick"/)
  })

  it('derives the branch stroke from the child border, defaulting to gray', () => {
    expect(src).toContain("const DEFAULT_BRANCH_COLOR = '#525252'")
    expect(src).toContain('child?.border?.color || DEFAULT_BRANCH_COLOR')
    expect(src).toContain(':stroke="strokeColor"')
  })
})
