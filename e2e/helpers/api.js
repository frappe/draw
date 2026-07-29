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
