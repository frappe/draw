import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #261/#262: a selected mind-map or flowchart node shows only its selection outline —
// no resize handles and no rotation knob (both live in the single `<g v-if="single">`
// group). Their add-node CTAs are hover-triggered, not part of selection. Pinned by
// source inspection; SelectionLayer can't mount in the node env (house pattern).
const dir = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(dir, './SelectionLayer.vue'), 'utf8')
const shapeViewSrc = readFileSync(path.join(dir, './ShapeView.vue'), 'utf8')

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

// #7: even if a node somehow carries a rotation angle (paste, legacy data), ShapeView
// must render it upright — nodes auto-size and never rotate.
describe('mind-map / flowchart nodes never render rotated (#7)', () => {
  it('zeroes the render rotation for node roles', () => {
    expect(shapeViewSrc).toContain(
      "const roleIsNode = props.shape.role === 'mindmap-node' || props.shape.role === 'flowchart-node'",
    )
    expect(shapeViewSrc).toContain('const rotation = roleIsNode ? 0 : props.shape.rotation')
  })
})
