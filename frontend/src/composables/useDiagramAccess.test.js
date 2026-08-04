import { describe, it, expect } from 'vitest'
import { reactive, nextTick } from 'vue'
import { useDiagramAccess } from './useDiagramAccess.js'

// A stand-in for frappe-ui's document resource: `doc` holds the loaded document,
// `get.error` the last load failure, and a failed load nulls `doc` out.
function fakeResource() {
  return reactive({ doc: null, get: { error: null } })
}

describe('useDiagramAccess', () => {
  it('stays loading until the document resolves', () => {
    expect(useDiagramAccess(fakeResource()).value).toBe('loading')
  })

  it('is ready once the document lands', async () => {
    const resource = fakeResource()
    const access = useDiagramAccess(resource)

    resource.doc = { name: 'abc', document: '{}' }
    await nextTick()

    expect(access.value).toBe('ready')
  })

  it('is ready immediately for an already-loaded document', () => {
    const resource = fakeResource()
    resource.doc = { name: 'abc' }
    expect(useDiagramAccess(resource).value).toBe('ready')
  })

  // The defect this exists for (#173): the load 403s and the editor opened anyway,
  // on an empty document nothing could save.
  it('is denied when the load fails', async () => {
    const resource = fakeResource()
    const access = useDiagramAccess(resource)

    resource.get.error = { exc_type: 'PermissionError' }
    await nextTick()

    expect(access.value).toBe('denied')
  })

  // The document resource is shared with the share menu, which reloads it after a
  // share change; a failure there must not tear down an editor holding edits.
  it('keeps a loaded editor open when a later reload fails', async () => {
    const resource = fakeResource()
    const access = useDiagramAccess(resource)

    resource.doc = { name: 'abc' }
    await nextTick()
    resource.doc = null
    resource.get.error = { exc_type: 'PermissionError' }
    await nextTick()

    expect(access.value).toBe('ready')
  })
})
