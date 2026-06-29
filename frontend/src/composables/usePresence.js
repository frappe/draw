// Presence on a diagram (spec 11.3). Always shows the current user (read from
// Frappe's session cookies). Co-viewers light up over Frappe realtime when it's
// available — full multi-user presence depends on the realtime backend (11.1);
// until then this degrades cleanly to just "you", and the wiring is ready.

import { ref, onMounted, onBeforeUnmount } from 'vue'

const HEARTBEAT_MS = 15000
const STALE_MS = 35000

export function usePresence(diagramName) {
  const me = currentUser()
  const peers = ref([])
  let heartbeat = null
  let prune = null
  let rt = null
  let handler = null

  function upsert(data) {
    if (!data || data.user === me.id || data.name !== diagramName) return
    const now = nowMs()
    const existing = peers.value.find((p) => p.id === data.user)
    if (existing) existing.at = now
    else peers.value = [...peers.value, { id: data.user, identity: data.identity || data.user, at: now }]
  }

  onMounted(() => {
    rt = typeof window !== 'undefined' ? window.frappe?.realtime : null
    if (!rt?.on) return
    handler = (data) => upsert(data)
    rt.on('draw_presence', handler)
    const announce = () => rt.publish?.('draw_presence', { name: diagramName, user: me.id, identity: me.identity })
    announce()
    heartbeat = setInterval(announce, HEARTBEAT_MS)
    prune = setInterval(() => {
      const cutoff = nowMs() - STALE_MS
      peers.value = peers.value.filter((p) => p.at >= cutoff)
    }, HEARTBEAT_MS)
  })

  onBeforeUnmount(() => {
    if (heartbeat) clearInterval(heartbeat)
    if (prune) clearInterval(prune)
    if (rt?.off && handler) rt.off('draw_presence', handler)
  })

  return { me, peers }
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : 0
}

// The signed-in user from Frappe's session cookies (no extra request). The
// identity shown on hover is the login id / email; an unauthenticated viewer of a
// public link has user_id "Guest" (Frappe's default) → shown as "Guest".
function currentUser() {
  const raw = cookie('user_id')
  const id = !raw || raw === 'Guest' ? 'Guest' : raw
  const fullName = (cookie('full_name') || '').replace(/^"|"$/g, '')
  // Hover label = email/login (the ask); fall back to the full name, then Guest.
  const identity = id === 'Guest' ? 'Guest' : id || fullName || 'Guest'
  return { id, identity, initials: initialsOf(fullName || id) }
}

// Initials for an avatar. Emails use the part before "@"; names use first+last.
export function initialsOf(value) {
  const base = String(value || '').replace(/@.*/, '').trim()
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function cookie(name) {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')
  return match ? decodeURIComponent(match.pop()) : ''
}
