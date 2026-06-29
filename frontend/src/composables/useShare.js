// Sharing: global-access toggle + copy link (spec §9). A single "Allow global
// access" toggle flips Draw Diagram.is_public; copy link yields the viewer URL.
// Prefers a backend whitelisted method when present, else falls back to the
// document resource's setValue so this works before the backend agent lands it.

import { ref, computed } from 'vue'
import { call, toast } from 'frappe-ui'

const TOGGLE_METHOD = 'frappe_draw.api.diagram.set_public_access'
const LEVEL_METHOD = 'frappe_draw.api.diagram.set_public_access_level'

export function useShare(diagramResource) {
  const updating = ref(false)

  const isPublic = computed(() => Boolean(diagramResource?.doc?.is_public))
  // 'view' (read-only viewer) or 'edit' (link-holders open the editor) — spec 11.4.
  const accessLevel = computed(() => diagramResource?.doc?.public_access_level || 'view')

  const baseUrl = computed(() => {
    const name = diagramResource?.doc?.name
    if (!name) return ''
    return `${window.location.origin}/frappe_draw`
  })

  // The share link points at the viewer for 'view' access and the editor for
  // 'edit' access, so the role and the URL always agree.
  const shareLink = computed(() => {
    const name = diagramResource?.doc?.name
    if (!name) return ''
    const path = accessLevel.value === 'edit' ? 'd' : 'view'
    return `${baseUrl.value}/${path}/${encodeURIComponent(name)}`
  })

  // An <iframe> snippet embedding the read-only viewer (spec 12.5). ?embed=1 tells
  // the viewer to drop its footer chrome.
  const embedCode = computed(() => {
    const name = diagramResource?.doc?.name
    if (!name) return ''
    const src = `${baseUrl.value}/view/${encodeURIComponent(name)}?embed=1`
    return `<iframe src="${src}" width="800" height="600" style="border:1px solid #e2e2e2;border-radius:8px" allowfullscreen></iframe>`
  })

  async function setAccessLevel(level) {
    if (!diagramResource?.doc?.name || updating.value) return
    updating.value = true
    try {
      await persistLevel(diagramResource, diagramResource.doc.name, level)
    } catch (error) {
      console.error('Access level update failed', error)
      toast.error('Could not update the access level.')
    } finally {
      updating.value = false
    }
  }

  async function copyEmbed() {
    if (!embedCode.value) return
    try {
      await copyToClipboard(embedCode.value)
      toast.success('Embed code copied to clipboard')
    } catch (error) {
      toast.error('Could not copy the embed code.')
    }
  }

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

  return {
    isPublic,
    accessLevel,
    shareLink,
    embedCode,
    updating,
    toggleGlobalAccess,
    setAccessLevel,
    copyLink,
    copyEmbed,
    diagramResource,
  }
}

// Persist the access level via the backend method, falling back to a field write
// when the method isn't deployed yet (same pattern as persistAccess).
async function persistLevel(diagramResource, name, level) {
  try {
    await call(LEVEL_METHOD, { name, level })
  } catch (error) {
    if (!isMethodMissing(error)) throw error
    await diagramResource.setValue.submit({ public_access_level: level })
    return
  }
  if (diagramResource.reload) await diagramResource.reload()
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
