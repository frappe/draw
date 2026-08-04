// Commenting on a diagram (#108). Owns the comment threads for the open diagram and
// the draft being placed, talks to draw.api.comment.*, and keeps everyone in sync
// over Frappe realtime.
//
// Why a server store and not the Yjs document: the real-time document rides a
// peer-to-peer room issued only to editors (get_collab_room), so a comment-level
// user is never in that session. Comments therefore live server-side; a realtime
// nudge (the same channel usePresence uses) tells every open editor of THIS diagram
// to refetch through the permission-gated API.
//
// Provided as 'comments'; useComments() injects it.

import { ref, computed, provide, inject, onBeforeUnmount, getCurrentInstance } from 'vue'
import { call, toast } from 'frappe-ui'

const KEY = 'comments'

const API = {
  list: 'draw.api.comment.list_comments',
  add: 'draw.api.comment.add_comment',
  reply: 'draw.api.comment.reply_comment',
  resolve: 'draw.api.comment.resolve_comment',
  edit: 'draw.api.comment.edit_comment',
  remove: 'draw.api.comment.delete_comment',
}

const REALTIME_EVENT = 'draw_comment_update'

export function createComments(diagramName) {
  // Flat list of every comment (roots + replies), oldest first — the API's shape.
  const comments = ref([])
  const canComment = ref(false)
  const canModerate = ref(false)
  const loading = ref(false)
  // The comment being placed but not yet posted: { anchorType, shapeId?, x?, y? }.
  // While set the pins layer shows a draft pin with an open composer.
  const draft = ref(null)
  // The thread whose popover is open on the canvas (a root comment name), or null.
  const activeThread = ref(null)

  const me = currentUser()

  // Roots (a thread each) with their replies attached, newest thread first so fresh
  // discussion sits at the top of the panel; replies stay oldest-first within a thread.
  const threads = computed(() => {
    const roots = comments.value.filter((c) => !c.parent_comment)
    const byParent = new Map()
    for (const c of comments.value) {
      if (!c.parent_comment) continue
      const list = byParent.get(c.parent_comment) || []
      list.push(c)
      byParent.set(c.parent_comment, list)
    }
    return roots
      .slice()
      .sort((a, b) => (a.creation < b.creation ? 1 : -1))
      .map((root) => ({ root, replies: byParent.get(root.name) || [] }))
  })

  const openThreads = computed(() => threads.value.filter((t) => !t.root.resolved))
  const resolvedThreads = computed(() => threads.value.filter((t) => t.root.resolved))
  // Only anchored roots get a canvas pin; a general (panel-only) comment has none.
  const pins = computed(() =>
    threads.value.filter((t) => t.root.anchor_type === 'shape' || t.root.anchor_type === 'board'),
  )

  function name() {
    return diagramName
  }

  async function load() {
    if (!name()) return
    loading.value = true
    try {
      const result = await call(API.list, { diagram: name() })
      comments.value = result?.comments || []
      canComment.value = !!result?.can_comment
      canModerate.value = !!result?.can_moderate
    } catch (error) {
      // A viewer who lost access, or an offline blip: keep whatever we had rather
      // than blanking the panel, and don't toast on every failed poll.
      canComment.value = false
    } finally {
      loading.value = false
    }
  }

  // Upsert a returned row so the author sees their action immediately; realtime then
  // reconciles everyone (including a redundant, debounced refetch here).
  function apply(row) {
    if (!row?.name) return
    const index = comments.value.findIndex((c) => c.name === row.name)
    if (index === -1) comments.value = [...comments.value, row]
    else comments.value.splice(index, 1, row)
  }

  function dropLocal(commentName) {
    comments.value = comments.value.filter(
      (c) => c.name !== commentName && c.parent_comment !== commentName,
    )
  }

  // ----- draft placement -----

  function startDraft(anchor) {
    draft.value = { ...anchor }
    activeThread.value = null
  }

  function cancelDraft() {
    draft.value = null
  }

  async function submitDraft(content) {
    const anchor = draft.value
    if (!anchor || !content?.trim()) return cancelDraft()
    const row = await addComment(anchor, content)
    cancelDraft()
    if (row) activeThread.value = row.name
    return row
  }

  // ----- mutations -----

  async function addComment(anchor, content) {
    try {
      const row = await call(API.add, {
        diagram: name(),
        content,
        anchor_type: anchor.anchorType,
        shape_id: anchor.shapeId ?? null,
        board_x: anchor.x ?? null,
        board_y: anchor.y ?? null,
      })
      apply(row)
      return row
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not add the comment.')
      return null
    }
  }

  async function reply(rootName, content) {
    if (!content?.trim()) return null
    try {
      const row = await call(API.reply, { diagram: name(), parent_comment: rootName, content })
      apply(row)
      return row
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not post the reply.')
      return null
    }
  }

  async function resolve(rootName, resolved) {
    try {
      const row = await call(API.resolve, { diagram: name(), comment: rootName, resolved: resolved ? 1 : 0 })
      apply(row)
      return row
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not update the thread.')
      return null
    }
  }

  async function edit(commentName, content) {
    if (!content?.trim()) return null
    try {
      const row = await call(API.edit, { diagram: name(), comment: commentName, content })
      apply(row)
      return row
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not edit the comment.')
      return null
    }
  }

  async function remove(commentName) {
    try {
      await call(API.remove, { diagram: name(), comment: commentName })
      dropLocal(commentName)
      if (activeThread.value === commentName) activeThread.value = null
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not delete the comment.')
    }
  }

  function openThread(rootName) {
    activeThread.value = rootName
  }
  function closeThread() {
    activeThread.value = null
  }

  // ----- realtime sync -----

  let rt = null
  let handler = null
  let reloadTimer = null
  function debouncedReload() {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(load, 250)
  }

  function connect() {
    rt = typeof window !== 'undefined' ? window.frappe?.realtime : null
    if (!rt?.on) return
    handler = (data) => {
      if (data?.diagram === name()) debouncedReload()
    }
    rt.on(REALTIME_EVENT, handler)
  }

  function disconnect() {
    if (reloadTimer) clearTimeout(reloadTimer)
    if (rt?.off && handler) rt.off(REALTIME_EVENT, handler)
  }

  connect()
  // Auto-teardown when created inside a component (the real path); a bare
  // construction (tests) skips the hook and tears down via disconnect() if needed.
  if (getCurrentInstance()) onBeforeUnmount(disconnect)

  return {
    comments,
    threads,
    openThreads,
    resolvedThreads,
    pins,
    canComment,
    canModerate,
    loading,
    draft,
    activeThread,
    me,
    load,
    startDraft,
    cancelDraft,
    submitDraft,
    addComment,
    reply,
    resolve,
    edit,
    remove,
    openThread,
    closeThread,
  }
}

// The signed-in user from Frappe's session cookies (no extra request), matching
// usePresence — used to decide the author-only affordances (edit / delete own).
function currentUser() {
  const id = cookie('user_id') || 'Guest'
  const fullName = (cookie('full_name') || '').replace(/^"|"$/g, '')
  return { id, fullName: fullName || id }
}

function cookie(name) {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
  return match ? decodeURIComponent(match.pop()) : ''
}

export function provideComments(comments) {
  provide(KEY, comments)
  return comments
}

export function useComments() {
  return inject(KEY)
}
