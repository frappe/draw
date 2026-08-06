// Sharing (spec §9 / GitHub #106). Two independent surfaces:
//   - per-user access: addMember / setMemberRole / removeMember at a level of
//     'view' | 'comment' | 'edit', via draw.api.share.* (DocShare-backed);
//   - general access: one VIEW-ONLY tier for everyone else —
//     'restricted' | 'site_users_view' | 'public_view' — via setGeneralAccess,
//     plus a one-click copy of the link.
// The tier is derived from two diagram flags (is_public, all_site_users_can_view),
// so a diagram made public before the middle tier existed keeps working unchanged.

import { ref, computed } from 'vue'
import { call, toast } from 'frappe-ui'

const GENERAL_ACCESS_METHOD = 'draw.api.share.set_general_access'
const SHARE = {
  list: 'draw.api.share.get_diagram_shares',
  share: 'draw.api.share.share_diagram', // idempotent: also updates an existing level
  remove: 'draw.api.share.unshare_diagram',
  search: 'draw.api.share.search_users',
}

// The three general-access tiers, in menu order — each with its icon and helper
// copy. This is the single source of truth the Share dialog renders; general access
// is VIEW ONLY, so there is deliberately no edit tier here.
export const GENERAL_ACCESS_OPTIONS = [
  // `icon` holds the COMPLETE lucide utility class: Tailwind's JIT only emits
  // classes it can read literally, so `lucide-${name}` produces no CSS.
  { value: 'restricted', label: 'Restricted', description: 'Only people with access can open the link', icon: 'lucide-lock' },
  { value: 'site_users_view', label: 'All site users can view', description: 'Everyone signed in to this site', icon: 'lucide-building-2' },
  { value: 'public_view', label: 'Anyone with the link can view', description: 'No sign-in required', icon: 'lucide-globe' },
]

// Per-member access levels shown in the People list (removal is a separate control).
export const MEMBER_ROLE_OPTIONS = [
  { value: 'view', label: 'Can view' },
  { value: 'comment', label: 'Can comment' },
  { value: 'edit', label: 'Can edit' },
]

const GENERAL_ACCESS_TOAST = {
  restricted: 'Now restricted to invited members',
  site_users_view: 'All site users can now view',
  public_view: 'Anyone with the link can now view',
}

// The diagram's general-access tier, derived from its two flags. is_public
// (public_view) outranks all_site_users_can_view when both are somehow set.
export function generalAccessLevel(doc) {
  if (doc?.is_public) return 'public_view'
  if (doc?.all_site_users_can_view) return 'site_users_view'
  return 'restricted'
}

export function useShare(diagramResource) {
  const updating = ref(false)
  // People the diagram is shared with (Drive-style), loaded when the dialog opens.
  const members = ref([])

  const generalAccess = computed(() => generalAccessLevel(diagramResource?.doc))
  // Kept for callers/tests that only care about the public tier.
  const isPublic = computed(() => generalAccess.value === 'public_view')

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
  // An earlier version returned early while `updating` was true, so switching tiers
  // twice in quick succession discarded the second change silently — and the control
  // then snapped back to the stale value, telling the user their click had taken
  // effect when it had not. Queueing keeps the last thing they asked for; the guard
  // against concurrent requests stays, it just no longer costs the user their intent.
  let queue = Promise.resolve()

  // Set the desired tier rather than flipping the current one: a toggle applied to a
  // value that is itself mid-update is ambiguous, a desired state never is.
  function setGeneralAccess(level) {
    queue = queue.then(() => applyGeneralAccess(level))
    return queue
  }

  async function applyGeneralAccess(level) {
    const target = diagramResource?.doc?.name
    if (!target || level === generalAccess.value) return
    updating.value = true
    try {
      await call(GENERAL_ACCESS_METHOD, { name: target, level })
      if (diagramResource.reload) await diagramResource.reload()
      toast.success(GENERAL_ACCESS_TOAST[level] || 'Sharing updated')
    } catch (error) {
      console.error('General access change failed', error)
      toast.error('Could not update sharing. Please try again.')
    } finally {
      updating.value = false
    }
  }

  // Backward-compatible shims for the old two-state public toggle: they now drive the
  // general-access tier (public_view <-> restricted).
  function setGlobalAccess(next) {
    return setGeneralAccess(next ? 'public_view' : 'restricted')
  }
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
    generalAccess,
    shareLink,
    updating,
    members,
    setGeneralAccess,
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
