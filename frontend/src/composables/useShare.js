// Sharing (spec §9). Two independent surfaces:
//   - per-user access: addMember / setMemberRole / removeMember at a level of
//     'view' | 'comment' | 'edit', via draw.api.share.* (DocShare-backed);
//   - a public "anyone with the link" toggle that flips Draw Diagram.is_public,
//     plus a one-click copy of the link.
// The public toggle prefers a backend whitelisted method when present, else falls
// back to the document resource's setValue so it works before the backend lands it.

import { ref, computed } from 'vue'
import { call, toast } from 'frappe-ui'

const TOGGLE_METHOD = 'draw.api.share.set_public'
const SHARE = {
  list: 'draw.api.share.get_diagram_shares',
  share: 'draw.api.share.share_diagram', // idempotent: also updates an existing level
  remove: 'draw.api.share.unshare_diagram',
  search: 'draw.api.share.search_users',
}

export function useShare(diagramResource) {
  const updating = ref(false)
  // People the diagram is shared with (Drive-style), loaded when the dialog opens.
  const members = ref([])

  const isPublic = computed(() => Boolean(diagramResource?.doc?.is_public))

  function name() {
    return diagramResource?.doc?.name
  }

  async function loadShares() {
    if (!name()) return
    try {
      members.value = (await call(SHARE.list, { name: name() })) || []
    } catch (error) {
      members.value = []
    }
  }

  // level is 'view' | 'comment' | 'edit'.
  async function addMember(user, level = 'view') {
    if (!name() || !user) return
    try {
      await call(SHARE.share, { name: name(), user, level })
      await loadShares()
      toast.success(`Shared with ${user}`)
    } catch (error) {
      toast.error(error?.messages?.[0] || 'Could not share with that person.')
    }
  }

  async function setMemberRole(user, level) {
    if (!name()) return
    try {
      await call(SHARE.share, { name: name(), user, level })
      await loadShares()
    } catch (error) {
      toast.error('Could not update access.')
    }
  }

  async function removeMember(user) {
    if (!name()) return
    try {
      await call(SHARE.remove, { name: name(), user })
      await loadShares()
    } catch (error) {
      toast.error('Could not remove access.')
    }
  }

  async function searchUsers(txt) {
    try {
      return (await call(SHARE.search, { txt: txt || '' })) || []
    } catch (error) {
      return []
    }
  }

  // Anyone with this link gets view-only access via the viewer route (router.js).
  const shareLink = computed(() => {
    const name = diagramResource?.doc?.name
    if (!name) return ''
    return `${window.location.origin}/draw/view/${encodeURIComponent(name)}`
  })

  // Serialises access changes instead of dropping the ones that arrive mid-flight.
  //
  // This used to return early while `updating` was true, so switching to "anyone with
  // the link" and straight back to "restricted" discarded the second change silently —
  // and the dropdown then snapped back to the stale value, telling the user their
  // click had taken effect when it had not. Queueing keeps the last thing they asked
  // for; the guard against concurrent requests is kept, it just no longer costs the
  // user their intent.
  let queue = Promise.resolve()

  // Set the desired state rather than flipping the current one: a toggle applied to a
  // value that is itself mid-update is ambiguous, a desired state never is.
  function setGlobalAccess(next) {
    queue = queue.then(() => applyGlobalAccess(Boolean(next)))
    return queue
  }

  async function applyGlobalAccess(next) {
    const name = diagramResource?.doc?.name
    if (!name || next === isPublic.value) return
    updating.value = true
    try {
      await persistAccess(diagramResource, name, next)
      toast.success(next ? 'Sharing is on — anyone with the link can view' : 'Sharing turned off')
    } catch (error) {
      console.error('Share toggle failed', error)
      toast.error('Could not update sharing. Please try again.')
    } finally {
      updating.value = false
    }
  }

  // Kept as a shim: it was the public name on this composable, and flipping the
  // current value is still what a bare "toggle" should mean.
  function toggleGlobalAccess() {
    return setGlobalAccess(!isPublic.value)
  }

  async function copyLink() {
    if (!shareLink.value) return
    try {
      await copyToClipboard(shareLink.value)
      toast.success('Link copied to clipboard')
    } catch (error) {
      console.error('Copy link failed', error)
      toast.error('Could not copy the link.')
    }
  }

  return {
    isPublic,
    shareLink,
    updating,
    members,
    toggleGlobalAccess,
    setGlobalAccess,
    copyLink,
    loadShares,
    addMember,
    setMemberRole,
    removeMember,
    searchUsers,
    diagramResource,
  }
}

// Try the backend method first; if it is not deployed yet, fall back to a plain
// field update through the document resource. Either way refresh local state.
async function persistAccess(diagramResource, name, isPublic) {
  try {
    await call(TOGGLE_METHOD, { name, enabled: isPublic ? 1 : 0 })
  } catch (error) {
    if (!isMethodMissing(error)) throw error
    await diagramResource.setValue.submit({ is_public: isPublic ? 1 : 0 })
    return
  }
  if (diagramResource.reload) await diagramResource.reload()
}

function isMethodMissing(error) {
  const message = String(error?.message || error?.exc_type || error || '')
  return /404|DoesNotExist|Not Found|AttributeError|ModuleNotFound/i.test(message)
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const field = document.createElement('textarea')
  field.value = text
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  document.execCommand('copy')
  document.body.removeChild(field)
}
