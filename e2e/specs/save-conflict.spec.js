import { test, expect, watchForErrors } from '../helpers/fixtures.js'
import { dragShapeFromCatalog } from '../helpers/editor.js'

// #171: a save rejected as stale freezes the editor, and the freeze message was
// never rendered — `frozen` existed only inside useAutosave, so the user saw a bare
// "Save failed" while the canvas kept accepting edits that no longer reached the
// server. This drives the real toolbar to prove the guidance now reaches the user.
//
// The freeze itself is the correct outcome ONLY here, where the conflicting write
// comes from a session this editor is not connected to. The collaborative case —
// two peers of one Yjs room, where the loser of the revision race retries instead
// of freezing — is covered in useAutosave.test.js: it needs a peer-to-peer
// connection between two browser contexts, which is not a deterministic thing to
// assert on in this suite.

// The message names the ACTION now, not only the cause (#504).
const FREEZE_MESSAGE = 'This diagram was changed elsewhere — reload to see the latest version.'

// Save the diagram from "another session", which advances the stored revision past
// the one this editor holds. Goes through save_diagram (not a raw doc write) so the
// revision moves exactly as a second editor would move it.
async function saveFromAnotherSession(page, name) {
  return page.evaluate(async (docName) => {
    const read = await fetch(
      `/api/resource/Draw Diagram/${encodeURIComponent(docName)}?fields=["document","revision"]`,
    )
    const { data } = await read.json()
    const res = await fetch('/api/method/draw.api.diagram.save_diagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': window.csrf_token || '' },
      body: JSON.stringify({ name: docName, document: data.document, revision: data.revision }),
    })
    const json = await res.json()
    if (!json.message) throw new Error(`conflicting save failed: ${JSON.stringify(json).slice(0, 300)}`)
    return json.message.revision
  }, name)
}

test('a conflicting save tells the user to reload instead of only "Save failed"', async ({
  page,
  diagram,
}) => {
  const errors = watchForErrors(page)
  const name = await diagram.open('unified')

  await saveFromAnotherSession(page, name)

  // Any edit now triggers a save at the revision this tab still holds — the 417.
  await dragShapeFromCatalog(page, { x: 320, y: 260 })

  await expect(page.getByText(FREEZE_MESSAGE, { exact: true })).toBeVisible({ timeout: 20_000 })

  // A frozen editor goes on accepting edits, so the warning has to come with a way
  // to act on it (#504): reload, and a download first so the reload does not throw
  // the work away.
  // Scoped to the indicator itself: "Reload" is a common enough button name that an
  // unscoped lookup is ambiguous the moment anything else on the page offers one.
  const indicator = page.getByRole('status').filter({ hasText: 'changed elsewhere' })
  // One indicator, not two — asserted rather than assumed, because the unscoped
  // lookup that preceded this found two matching buttons and the reason mattered.
  await expect(indicator).toHaveCount(1)
  await expect(indicator.getByRole('button', { name: 'Reload' })).toBeVisible()
  await expect(indicator.getByRole('button', { name: 'Download a copy' })).toBeVisible()

  // The 417 is the expected outcome of this spec, so it must not count as a failure.
  const unexpected = errors.failures.filter((f) => !f.startsWith('417'))
  expect(unexpected, 'unexpected failed requests').toEqual([])
  expect(errors.pageErrors).toEqual([])
})
