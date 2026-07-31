// Diagram setup/teardown through the REST API.
//
// The create call runs INSIDE the page rather than through Playwright's request
// context, because Frappe wants the CSRF token that the SPA exposes as
// window.csrf_token once /draw has loaded.

export async function gotoHome(page) {
  await page.goto('/draw')
  await page.waitForLoadState('networkidle')
}

// Create a diagram and return its name. `document` is the full document JSON.
export async function createDiagram(page, { type, title, document }) {
  const name = await page.evaluate(
    async ([diagramType, docTitle, doc]) => {
      const res = await fetch('/api/resource/Draw Diagram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': window.csrf_token || '',
        },
        body: JSON.stringify({ title: docTitle, diagram_type: diagramType, document: doc }),
      })
      const json = await res.json()
      if (!json.data) throw new Error(`create failed: ${JSON.stringify(json).slice(0, 400)}`)
      return json.data.name
    },
    [type, title, JSON.stringify(document)],
  )
  return name
}

export async function deleteDiagram(page, name) {
  await page
    .evaluate(
      async (docName) => {
        await fetch(`/api/resource/Draw Diagram/${encodeURIComponent(docName)}`, {
          method: 'DELETE',
          headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' },
        })
      },
      name,
    )
    .catch(() => {})
}

// Read the persisted document back, to assert an edit actually saved.
export async function fetchDocument(page, name) {
  return page.evaluate(async (docName) => {
    const res = await fetch(
      `/api/resource/Draw Diagram/${encodeURIComponent(docName)}?fields=["document"]`,
    )
    const json = await res.json()
    const raw = json.data?.document
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  }, name)
}

// --- sharing -----------------------------------------------------------------
// Sharing is the one flow whose UI had NO browser coverage: it was wired to
// nonexistent `draw.api.diagram.*` methods once already (fixed in #13), and the
// three access levels only exist end to end if the dialog actually writes them.
// These read the persisted state back so a spec asserts on DocShare rows, not on
// what the dialog happens to be rendering.

// Create (or reuse) a user to share with. Idempotent: a fixed address is reused
// across runs so the suite does not accumulate users, and reusing one is safe
// because every spec shares a per-test diagram with it.
export async function ensureUser(page, email, fullName = 'E2E Share Target') {
  return page.evaluate(
    async ([addr, name]) => {
      const existing = await fetch(`/api/resource/User/${encodeURIComponent(addr)}`)
      if (existing.ok) return addr
      const res = await fetch('/api/resource/User', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': window.csrf_token || '' },
        body: JSON.stringify({ email: addr, first_name: name, send_welcome_email: 0, enabled: 1 }),
      })
      const json = await res.json()
      if (!json.data) throw new Error(`could not create ${addr}: ${JSON.stringify(json).slice(0, 300)}`)
      return json.data.name
    },
    [email, fullName],
  )
}

// The diagram's share rows as the backend sees them: [{user, level, ...}].
export async function fetchShares(page, name) {
  return page.evaluate(async (docName) => {
    const res = await fetch(
      `/api/method/draw.api.share.get_diagram_shares?name=${encodeURIComponent(docName)}`,
    )
    const json = await res.json()
    return json.message || []
  }, name)
}

// Whether the diagram is currently public (the "anyone with the link" setting).
export async function fetchIsPublic(page, name) {
  return page.evaluate(async (docName) => {
    const res = await fetch(
      `/api/resource/Draw Diagram/${encodeURIComponent(docName)}?fields=["is_public"]`,
    )
    const json = await res.json()
    return Number(json.data?.is_public ?? 0)
  }, name)
}
