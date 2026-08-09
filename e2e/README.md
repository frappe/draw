# E2E tests

Playwright specs that drive the real Draw SPA against a running bench. They exist
because the unit tests (`frontend`, vitest) cover pure model/layout logic and the
Python tests cover doctypes — neither can catch "the tool renders something that
never gets saved", which is the failure mode this canvas actually has.

## Running

```bash
bench start                     # in another terminal; the specs need a live site
yarn test:e2e                   # all specs
yarn test:e2e:headed            # watch it drive the browser
yarn test:e2e:ui                # Playwright's UI mode, good for debugging one spec
yarn test:e2e e2e/specs/unified-canvas.spec.js   # one file
```

Configuration (`playwright.config.js`) defaults to `http://test.localhost:8000` and
logs in as `Administrator` / `Admin`. Override with env vars:

```bash
DRAW_BASE_URL=http://mysite.localhost:8000 DRAW_USER=… DRAW_PASSWORD=… yarn test:e2e
```

It drives the **installed Chrome** (`channel: 'chrome'`), so no `playwright install`
step is needed locally. Set `PLAYWRIGHT_CHANNEL=chromium` where a bundled browser is
provisioned instead.

## How specs are written

- **Seed documents through the API, don't click them into existence.** `diagram.open('unified')`
  creates a seeded document, opens it, and deletes it at teardown. Builders live in
  `fixtures/documents.js`. Beyond speed, this matters because several surfaces render
  an empty-state placeholder until a document has content — the minimap shows a
  placeholder, so a click-through test silently exercises degenerate bounds.
- **Assert on the PERSISTED document wherever possible** (`diagram.saved(name)`), not
  just on rendered pixels. A tool that draws something transient but never saves it
  looks perfect on screen.
- Use the helpers in `helpers/editor.js` rather than raw selectors — each encodes a
  trap that cost real debugging time:

| Helper | Why it exists |
| --- | --- |
| `toolByIcon` | Toolbar buttons are icon-only: no label, no name, no data attribute, and frappe-ui tooltips don't render under synthetic hover. Selectors match the button's lucide CSS class (every icon is a `lucide-*` class since #311); legacy feather names in specs resolve through `LUCIDE_ALIAS`. **Always scope tool lookups to the palette** — the pencil is both the whiteboard Pen and the title's rename button, and an unscoped `.first()` clicks the wrong one. |
| `clickNode` | A transparent hit-rect covers each mind-map label and intercepts pointer events, so `Locator.click()` is refused. Dispatches a mouse click at the label's centre. |
| `dragTileToCanvas` | Playwright's synthetic mouse does not reliably start a native HTML5 drag — a mouse-based attempt hangs. Dispatches the drag events with one shared `DataTransfer`, which is the real producer/consumer contract. |
| `clickEmptyCanvas` | Clicks near the TOP-left. The bottom-left corner holds the zoom controls, so clicking there never reaches the canvas. |

Popover items are awaited for visibility before clicking (see `insertFromMenu`):
clicking straight after opening a popover can land while it is still settling, which
misses silently and then looks like a broken feature.

## Why the suite is serial

`workers: 1`. Specs authenticate as one Frappe user against one bench, and parallel
workers produce intermittent bare-400 responses from contention over that session —
a flake that wandered between specs on every run. Logging each worker in separately
made it worse. Parallelising properly needs a test user per worker; until then the
whole suite runs in about a minute, so there is no pressure to.

## Adding a spec

1. Pick or add a document builder in `fixtures/documents.js`.
2. `import { test, expect } from '../helpers/fixtures.js'` (not from `@playwright/test`
   directly — that skips the `diagram` fixture and its cleanup).
3. Drive with `helpers/editor.js`; assert with `diagram.saved(name)`.
4. Give failures a message that says what broke, not what the assertion was.
