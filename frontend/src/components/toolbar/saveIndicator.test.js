import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// #504: the indicator said "Save failed" and stopped. It could not tell a failure
// worth retrying from one that needs the page reloaded, and it offered no way to
// keep the work either way.
//
// Source-inspected like the other toolbar guards — this repo keeps unit tests
// browser-free (node env, no @vue/test-utils). Comments stripped, since the ones in
// this component quote the wording it replaced.
const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, 'SaveIndicator.vue'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const template = source.slice(source.indexOf('<template>'))

describe('the save indicator says which kind of failure it is (#504)', () => {
  it('tells the user a retryable failure is being retried', () => {
    expect(source).toContain('Save failed — retrying.')
  })

  it('shows the freeze reason instead, when there is one', () => {
    // A frozen editor still accepts edits, so its reason has to win over the
    // generic label — otherwise the user has no idea their work stopped being kept.
    expect(source).toContain('if (props.message) return props.message')
  })

  it('offers actions only for the blocking kind', () => {
    // Offering a reload for a transient failure invites throwing away work over a
    // hiccup that resolves itself.
    expect(template).toContain('v-if="blocked"')
    const actions = template.slice(template.indexOf('v-if="blocked"'))
    expect(actions).toContain('label="Download a copy"')
    expect(actions).toContain('label="Reload"')
  })

  it('always offers the download, because the work is in memory either way', () => {
    const download = template.slice(template.indexOf('label="Download a copy"'))
    const beforeDownload = template.slice(0, template.indexOf('label="Download a copy"'))
    // No `recoverable` gate on the download — only on the reload below it.
    expect(beforeDownload.split('<Button').pop()).not.toContain('v-if="recoverable"')
    expect(download).toContain('v-if="recoverable"')
  })

  it('stays silent while offline, which is announced as a toast instead', () => {
    expect(source).toContain("if (props.offline) return ''")
  })
})
