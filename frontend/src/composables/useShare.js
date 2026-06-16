// Sharing: global-access toggle + copy link (spec §9). A single "Allow global
// access" toggle flips Draw Diagram.is_public; copy link yields the viewer URL.
// Prefers a backend whitelisted method when present, else falls back to the
// document resource's setValue so this works before the backend agent lands it.

import { ref, computed } from 'vue'
import { call, toast } from 'frappe-ui'

const TOGGLE_METHOD = 'frappe_draw.api.diagram.set_public_access'

export function useShare(diagramResource) {
  const updating = ref(false)

  const isPublic = computed(() => Boolean(diagramResource?.doc?.is_public))

  // The viewer route is mounted under the SPA base /frappe_draw (router.js).
  const shareLink = computed(() => {
    const name = diagramResource?.doc?.name
    if (!name) return ''
    return `${window.location.origin}/frappe_draw/view/${encodeURIComponent(name)}`
  })

  async function toggleGlobalAccess() {
    const name = diagramResource?.doc?.name
    if (!name || updating.value) return
    updating.value = true
    const next = !isPublic.value
    try {
      await persistAccess(diagramResource, name, next)
      toast.success(next ? 'Anyone with the link can now view' : 'Link access turned off')
    } catch (error) {
      console.error('Share toggle failed', error)
      toast.error('Could not update sharing. Please try again.')
    } finally {
      updating.value = false
    }
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

  return { isPublic, shareLink, updating, toggleGlobalAccess, copyLink, diagramResource }
}

// Try the backend method first; if it is not deployed yet, fall back to a plain
// field update through the document resource. Either way refresh local state.
async function persistAccess(diagramResource, name, isPublic) {
  try {
    await call(TOGGLE_METHOD, { name, is_public: isPublic ? 1 : 0 })
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
