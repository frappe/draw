import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #229 removed the "Export" and "Share" text from the top bar, leaving four icon
// buttons in the actions cluster. Browser-free source checks, the same way
// overflowMenu.test.js and ShareMenu.test.js inspect their SFCs.
//
// Two things are easy to undo by accident and both matter:
//   • the accessible NAME. The visible text was the name; with it gone the buttons
//     need `label`, which frappe-ui's Button renders as aria-label. E2E locates
//     these by role+name (`getByRole('button', { name: 'Export', exact: true })`),
//     so dropping it breaks the suite and screen readers together.
//   • the TOOLTIP. An icon with no text and no tooltip is unidentifiable.
const here = path.dirname(fileURLToPath(import.meta.url))
const read = (file) => readFileSync(path.join(here, file), 'utf8')

// The cluster's four buttons, each in its own component.
const CLUSTER = [
  { file: 'ExportMenu.vue', name: 'Export', icon: 'lucide-download' },
  { file: 'CommentsToggle.vue', name: 'Comments', icon: 'lucide-message-square' },
  { file: 'ShareMenu.vue', name: 'Share', icon: 'lucide-share-2' },
  { file: 'OverflowMenu.vue', name: 'More actions', icon: 'lucide-ellipsis' },
]

// The cluster button is the first <Button …> in the file's template.
function firstButtonTag(source) {
  const match = source.match(/<Button\b[\s\S]*?\/?>/)
  if (!match) throw new Error('no <Button> found')
  return match[0]
}

describe('top bar actions cluster (#229)', () => {
  it.each(CLUSTER)('$name is a ghost icon button', ({ file }) => {
    expect(firstButtonTag(read(file))).toContain('variant="ghost"')
  })

  it.each(CLUSTER)('$name keeps an accessible name once its text is gone', ({ file, name }) => {
    expect(firstButtonTag(read(file))).toContain(`label="${name}"`)
  })

  it.each(CLUSTER)('$name has a tooltip, since nothing else identifies it', ({ file, name }) => {
    expect(firstButtonTag(read(file))).toContain(`tooltip="${name}"`)
  })

  it.each(CLUSTER)('$name renders its icon as a complete lucide class', ({ file, icon }) => {
    // Tailwind's JIT only emits classes it can read literally in the source (#292).
    expect(read(file)).toContain(icon)
  })

  it('shows no "Export" or "Share" text next to the icons', () => {
    // A self-closing trigger has no default slot, so there is no visible label.
    expect(firstButtonTag(read('ExportMenu.vue'))).toMatch(/\/>$/)
    expect(firstButtonTag(read('ShareMenu.vue'))).toMatch(/\/>$/)
  })

  it('keeps the unread-thread badge on the comments toggle', () => {
    // The badge is why this one button still needs the #icon slot.
    const source = read('CommentsToggle.vue')
    expect(source).toContain('<template #icon>')
    expect(source).toContain('v-if="openCount"')
  })
})
