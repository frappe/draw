import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #261/#262: a selected mind-map or flowchart node shows only its selection outline —
// no resize handles and no rotation knob (both live in the single `<g v-if="single">`
// group). Their add-node CTAs are hover-triggered, not part of selection. Pinned by
// source inspection; SelectionLayer can't mount in the node env (house pattern).
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), './SelectionLayer.vue'),
  'utf8',
)

describe('mind-map / flowchart nodes select to a plain border (#261/#262)', () => {
  it('treats both node roles as handle-less', () => {
    expect(src).toContain(
      'single.value?.role === ROLE.mindmapNode || single.value?.role === ROLE.flowchartNode',
    )
  })

  it('gates the resize + rotation handle group off for nodes', () => {
    expect(src).toContain('<g v-if="single && !singleIsNode" :transform="groupTransform">')
  })
})
