import { describe, it, expect, vi, beforeEach } from 'vitest'

// frappe-ui's `call` / `toast` are the network boundary; stub them so these tests
// exercise the store's grouping + mutation logic with no server or socket.
const call = vi.fn()
vi.mock('frappe-ui', () => ({
  call: (...args) => call(...args),
  toast: { success() {}, error() {} },
}))

const { createComments } = await import('./useComments.js')

// A flat comment list as list_comments returns it: two roots (one resolved), a reply,
// and a general (unanchored) root.
function seed(store) {
  store.comments.value = [
    { name: 'r1', parent_comment: null, anchor_type: 'board', board_x: 10, board_y: 20, resolved: 0, creation: '2026-08-04 10:00:00' },
    { name: 'r1a', parent_comment: 'r1', anchor_type: null, resolved: 0, creation: '2026-08-04 10:05:00' },
    { name: 'r2', parent_comment: null, anchor_type: 'shape', shape_id: 's1', resolved: 1, creation: '2026-08-04 11:00:00' },
    { name: 'g1', parent_comment: null, anchor_type: 'general', resolved: 0, creation: '2026-08-04 09:00:00' },
  ]
}

beforeEach(() => {
  call.mockReset()
})

describe('threads grouping', () => {
  it('nests replies under roots, newest thread first', () => {
    const c = createComments('d1')
    seed(c)
    const threads = c.threads.value
    expect(threads.map((t) => t.root.name)).toEqual(['r2', 'r1', 'g1']) // by creation desc
    const r1 = threads.find((t) => t.root.name === 'r1')
    expect(r1.replies.map((x) => x.name)).toEqual(['r1a'])
  })

  it('separates open and resolved threads', () => {
    const c = createComments('d1')
    seed(c)
    expect(c.openThreads.value.map((t) => t.root.name).sort()).toEqual(['g1', 'r1'])
    expect(c.resolvedThreads.value.map((t) => t.root.name)).toEqual(['r2'])
  })

  it('pins only anchored roots (board/shape), never a general comment', () => {
    const c = createComments('d1')
    seed(c)
    expect(c.pins.value.map((t) => t.root.name).sort()).toEqual(['r1', 'r2'])
  })
})

describe('load', () => {
  it('populates comments and permission flags', async () => {
    call.mockResolvedValueOnce({
      can_comment: true,
      can_moderate: false,
      comments: [{ name: 'r1', parent_comment: null, anchor_type: 'general', resolved: 0, creation: '2026-08-04 10:00:00' }],
    })
    const c = createComments('d1')
    await c.load()
    expect(call).toHaveBeenCalledWith('draw.api.comment.list_comments', { diagram: 'd1' })
    expect(c.canComment.value).toBe(true)
    expect(c.canModerate.value).toBe(false)
    expect(c.comments.value).toHaveLength(1)
  })
})

describe('mutations upsert locally', () => {
  it('addComment sends the anchor and appends the returned row', async () => {
    const row = { name: 'new', parent_comment: null, anchor_type: 'board', board_x: 5, board_y: 6, resolved: 0, creation: 'x' }
    call.mockResolvedValueOnce(row)
    const c = createComments('d1')
    const out = await c.addComment({ anchorType: 'board', x: 5, y: 6 }, 'hello')
    expect(call).toHaveBeenCalledWith('draw.api.comment.add_comment', {
      diagram: 'd1',
      content: 'hello',
      anchor_type: 'board',
      shape_id: null,
      board_x: 5,
      board_y: 6,
    })
    expect(out).toBe(row)
    expect(c.comments.value.map((x) => x.name)).toContain('new')
  })

  it('resolve replaces the existing row in place', async () => {
    const c = createComments('d1')
    seed(c)
    call.mockResolvedValueOnce({ name: 'r1', parent_comment: null, anchor_type: 'board', board_x: 10, board_y: 20, resolved: 1, creation: '2026-08-04 10:00:00' })
    await c.resolve('r1', true)
    const r1 = c.comments.value.find((x) => x.name === 'r1')
    expect(r1.resolved).toBe(1)
    expect(c.comments.value.filter((x) => x.name === 'r1')).toHaveLength(1) // replaced, not duplicated
  })

  it('remove drops the root and its replies', async () => {
    const c = createComments('d1')
    seed(c)
    call.mockResolvedValueOnce({ name: 'r1', deleted: true })
    await c.remove('r1')
    expect(c.comments.value.map((x) => x.name)).toEqual(['r2', 'g1'])
  })
})

describe('draft placement', () => {
  it('submitDraft posts the armed anchor, clears the draft, and opens the new thread', async () => {
    const row = { name: 'draftnew', parent_comment: null, anchor_type: 'shape', shape_id: 's9', resolved: 0, creation: 'x' }
    call.mockResolvedValueOnce(row)
    const c = createComments('d1')
    c.startDraft({ anchorType: 'shape', shapeId: 's9' })
    expect(c.draft.value).toEqual({ anchorType: 'shape', shapeId: 's9' })
    await c.submitDraft('on the box')
    expect(call).toHaveBeenCalledWith('draw.api.comment.add_comment', {
      diagram: 'd1',
      content: 'on the box',
      anchor_type: 'shape',
      shape_id: 's9',
      board_x: null,
      board_y: null,
    })
    expect(c.draft.value).toBe(null)
    expect(c.activeThread.value).toBe('draftnew')
  })

  it('an empty draft submit just cancels', async () => {
    const c = createComments('d1')
    c.startDraft({ anchorType: 'board', x: 1, y: 2 })
    await c.submitDraft('   ')
    expect(c.draft.value).toBe(null)
    expect(call).not.toHaveBeenCalled()
  })
})

// #424: what the UI does when the server refuses, and how quickly it responds when
// it does not. The fault that opened the issue was a delete reporting both
// "Comment deleted" and "Internal Server Error" while the comment stayed on screen:
// remove() swallowed the failure, so the caller went on to claim success.

const failure = (messages) => Object.assign(new Error('boom'), { messages })

describe('a refused action puts the list back', () => {
  it('remove throws and restores the thread', async () => {
    const c = createComments('d1')
    seed(c)
    c.openThread('r1')
    call.mockRejectedValueOnce(failure(['Internal Server Error']))

    await expect(c.remove('r1')).rejects.toThrow('Unable to delete the comment. Please try again.')

    expect(c.comments.value.map((x) => x.name).sort(), 'the comment vanished from a delete that failed').toEqual(
      ['g1', 'r1', 'r1a', 'r2'],
    )
    expect(c.activeThread.value, 'the restored thread is active again').toBe('r1')
  })

  it('keeps a message Frappe wrote, and drops the framework fallback', async () => {
    const c = createComments('d1')
    seed(c)
    call.mockRejectedValueOnce(failure(['You do not have permission to delete this comment.']))

    await expect(c.remove('r1')).rejects.toThrow('You do not have permission to delete this comment.')
  })

  it('resolve reverts the thread it moved', async () => {
    const c = createComments('d1')
    seed(c)
    call.mockRejectedValueOnce(failure([]))

    await c.resolve('r1', true)

    expect(c.comments.value.find((x) => x.name === 'r1').resolved).toBe(0)
  })

  it('reply takes back the message it showed', async () => {
    const c = createComments('d1')
    seed(c)
    call.mockRejectedValueOnce(failure([]))

    await c.reply('r1', 'nearly')

    expect(c.comments.value.some((x) => x.content === 'nearly')).toBe(false)
  })

  it('edit puts the old text back', async () => {
    const c = createComments('d1')
    c.comments.value = [{ name: 'r1', parent_comment: null, content: 'first', resolved: 0, creation: 'x' }]
    call.mockRejectedValueOnce(failure([]))

    await c.edit('r1', 'second')

    expect(c.comments.value[0].content).toBe('first')
  })
})

describe('an action shows before the server answers', () => {
  it('reply appears in the thread while it is still going out', async () => {
    const c = createComments('d1')
    seed(c)
    let settle
    call.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)))

    const posting = c.reply('r1', 'on its way')

    const thread = c.threads.value.find((t) => t.root.name === 'r1')
    expect(thread.replies.map((r) => r.content)).toContain('on its way')
    expect(thread.replies.at(-1).pending, 'the card needs to show it as sending').toBe(true)

    settle({ name: 'r1b', parent_comment: 'r1', content: 'on its way', resolved: 0, creation: 'y' })
    await posting
    const settled = c.threads.value.find((t) => t.root.name === 'r1')
    expect(settled.replies.map((r) => r.name), 'the server row replaced the provisional one').toEqual(['r1a', 'r1b'])
  })

  it('resolve moves the thread before the call lands', async () => {
    const c = createComments('d1')
    seed(c)
    call.mockReturnValueOnce(new Promise(() => {}))

    c.resolve('r1', true)

    expect(c.openThreads.value.map((t) => t.root.name)).toEqual(['g1'])
    expect(c.resolvedThreads.value.map((t) => t.root.name)).toEqual(['r2', 'r1'])
  })
})

describe('a refetch mid-flight', () => {
  it('keeps a reply whose provisional row was swept away by a reload', async () => {
    // The realtime nudge refetches the whole list. If that lands between showing a
    // reply and its answer, the provisional row is gone — and the answer has to
    // bring the real one in rather than replacing something that no longer exists.
    const c = createComments('d1')
    seed(c)
    let settle
    call.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)))

    const posting = c.reply('r1', 'survives a reload')
    seed(c) // a reload replaces the list, provisional row and all

    settle({ name: 'r1b', parent_comment: 'r1', content: 'survives a reload', resolved: 0, creation: 'y' })
    await posting

    expect(c.comments.value.map((x) => x.name)).toContain('r1b')
  })
})
