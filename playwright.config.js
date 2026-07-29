import { defineConfig, devices } from '@playwright/test'

// E2E config for Frappe Draw. Specs drive the real SPA against a running bench.
//
// Uses the INSTALLED Chrome (channel: 'chrome') rather than a downloaded browser
// bundle, so `yarn test:e2e` needs no `playwright install` step on a dev machine.
// CI can override with PLAYWRIGHT_CHANNEL=chromium once it provisions browsers.
const BASE_URL = process.env.DRAW_BASE_URL || 'http://test.localhost:8000'

export default defineConfig({
  testDir: './e2e/specs',
  // The editor boots an SPA, a Yjs provider and an autosave loop per diagram, so
  // give each test room without letting a genuine hang run long.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // SERIAL ON PURPOSE. Diagrams are per-test so they never collide, but the specs
  // all authenticate as one Frappe user against one bench, and concurrent workers
  // produce intermittent bare-400 responses from contention over that session —
  // a flake that wandered between specs on every run and cost real debugging time.
  // Logging each worker in separately made it worse (concurrent logins as the same
  // user destabilise the session further). Giving each worker its own test USER
  // would be the way to parallelise; until then, correctness beats speed. The whole
  // suite runs in ~20s serially, so there is no pressure to change this yet.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    viewport: { width: 1500, height: 950 },
    // Artifacts only for failures — a passing canvas test needs no 2 MB trace.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  // Auth is handled by a worker-scoped fixture (e2e/helpers/fixtures.js): each
  // worker logs in separately, because parallel workers sharing one Frappe session
  // get intermittent 400s from concurrent sid/CSRF use.
  projects: [{ name: 'draw', use: { ...devices['Desktop Chrome'] } }],
})
