// Shared test fixtures.
//
// `diagram` creates a seeded document of the requested type, opens it, and deletes
// it afterwards — so specs never leak diagrams into the library and never depend on
// each other's state.
//
//   test('...', async ({ page, diagram }) => {
//     await diagram.open('unified')                    // seeded default
//     await diagram.open('mindmap', { empty: true })   // no root node
//   })
//
// Auth is worker-scoped, so the login happens once per run (the suite is serial —
// see the workers note in playwright.config.js for why).

import { test as base } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { documents } from '../fixtures/documents.js'
import { createDiagram, deleteDiagram, gotoHome, fetchDocument } from './api.js'
import { openDiagram } from './editor.js'

const AUTH_DIR = 'e2e/.auth'

export const test = base.extend({
  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const usr = process.env.DRAW_USER || 'Administrator'
      const pwd = process.env.DRAW_PASSWORD || 'Admin'
      // A worker fixture cannot depend on the test-scoped `baseURL`, so read it off
      // the project config (same value playwright.config.js resolves).
      const baseURL = workerInfo.project.use.baseURL

      // The cache key includes the site AND the user, not just the worker index.
      // e2e/.auth is gitignored and therefore survives between runs, so a key of
      // worker index alone would reuse a session from a previous run after
      // DRAW_BASE_URL or DRAW_USER changed — silently testing the wrong site or
      // identity, with no login attempt to reveal it.
      const slug = (value) => String(value).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      const file = path.resolve(
        AUTH_DIR,
        `worker-${workerInfo.workerIndex}-${slug(baseURL)}-${slug(usr)}.json`,
      )
      if (fs.existsSync(file)) {
        await use(file)
        return
      }

      const context = await browser.newContext({ storageState: undefined })
      const res = await context.request.post(`${baseURL}/api/method/login`, {
        form: { usr, pwd },
      })
      if (!res.ok()) {
        throw new Error(
          `login failed for ${usr} (${res.status()}). Set DRAW_USER / DRAW_PASSWORD, or reset ` +
            'with `bench --site test.localhost set-admin-password <pw>`.',
        )
      }
      fs.mkdirSync(AUTH_DIR, { recursive: true })
      await context.storageState({ path: file })
      await context.close()
      await use(file)
    },
    { scope: 'worker' },
  ],

  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState)
  },

  diagram: async ({ page }, use, testInfo) => {
    const created = []
    await gotoHome(page) // needed once: window.csrf_token comes from the loaded SPA

    const api = {
      // Create + open a diagram of `type`; returns its name.
      async open(type, options = {}) {
        const name = await api.create(type, options)
        await openDiagram(page, name)
        return name
      },
      // Create without opening (for share / library specs).
      async create(type, options = {}) {
        const build = documents[type]
        if (!build) throw new Error(`no document fixture for type "${type}"`)
        const name = await createDiagram(page, {
          type,
          title: `e2e ${type} — ${testInfo.title}`.slice(0, 120),
          document: build(options),
        })
        created.push(name)
        return name
      },
      // Read the persisted document back, to prove an edit was saved.
      saved: (name) => fetchDocument(page, name),
    }

    await use(api)

    for (const name of created) await deleteDiagram(page, name)
  },
})

// Collect console errors and failed responses for a page.
//
// Returns a live object; assert on it at the END of a test. `pageErrors` are
// uncaught exceptions and are always a real defect. `failures` carries the URL and
// status of every 4xx/5xx, because the bare console line ("Failed to load resource:
// … 400") names no URL and is undiagnosable on its own.
// Requests whose failure says nothing about Draw. The realtime transport is the one
// that matters in practice: socket.io long-polling legitimately 400s when a session
// is torn down or a transport upgrade races, which happens routinely in CI and would
// otherwise fail whichever spec happened to be running at the time. Everything else
// — the app's own API calls and assets — is still asserted on.
const IGNORED_FAILURES = [/\/socket\.io\//]

export function watchForErrors(page) {
  const state = { consoleErrors: [], pageErrors: [], failures: [], ignoredFailures: [] }
  page.on('console', (m) => {
    if (m.type() === 'error') state.consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => state.pageErrors.push(String(e)))
  page.on('response', (res) => {
    if (res.status() < 400) return
    const entry = `${res.status()} ${res.request().method()} ${res.url()}`
    const bucket = IGNORED_FAILURES.some((re) => re.test(res.url()))
      ? state.ignoredFailures
      : state.failures
    bucket.push(entry)
  })
  return state
}

export { expect } from '@playwright/test'
