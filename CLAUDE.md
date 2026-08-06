# Draw (Frappe Draw) — Development Guide

Frappe Draw is a Vue 3 single-page diagram editor built as a Frappe app. The app
directory is `draw/`, and its Frappe module is `Draw`. The SPA is in `frontend/` and serves at route
`/draw`. DocTypes `Draw Diagram`, `Draw Folder`, and `Draw Comment` already exist.

## Source of truth — read before coding

`design/CONVENTIONS.md` is the binding engineering contract. Read it first, plus:

- `design/SPEC.md` — product spec, data model, and build order
- `design/README.md` — visual and interaction handoff (pixel-level)
- `design/taste.md` — code-quality rules
- `design/colors_and_type.css` — Espresso token values (reference only, never import)

When this file and a design document disagree, the design document wins.

## Skill usage (always)

- Any Frappe work (DocType, controller, hook, whitelisted API, bench, portal page,
  background job, permissions, tests): invoke `frappe-app-dev` before writing code.
- Any code edit: follow `code-style`. The `design/taste.md` rules take precedence.
- UI, layout, or visual work: use `ui-design`.
- Before finalizing any diff or PR: run `quality-code-review`.
- Docs, commits, and PR text: write in the style of `technical-writing`.

This bench ships its own scoped copies of these skills under
`frappe-bench/.claude/skills`. Prefer the scoped variant for files under this bench.

## Cardinal rules (non-negotiable — full detail in CONVENTIONS.md)

1. Build chrome with frappe-ui components and its Tailwind token classes
   (`bg-surface-base`, `text-ink-gray-9`, `border-outline-gray-1`, …). Never
   hand-roll a button or inline-style chrome, and never import colors_and_type.css.
   Match each token property to its family. Backgrounds use `surface-*`. Text and
   icons use `ink-*`. Borders and rings use `outline-*`. A mismatched class (for
   example `border-ink-gray-9`, `bg-surface-white`, `text-ink-white`) has no
   generated utility and renders nothing. `frontend/src/frappe-ui-tokens.test.js`
   fails if one reappears.
2. The SVG canvas is the exception. It uses literal color values and per-canvas
   theme presets, not chrome tokens. Shapes read the preset triad through `--t*`
   CSS variables that `DiagramCanvas` sets on the canvas wrapper via
   `data-fdpreset`. The presets live in `diagram/theme.js` (ocean, slate, violet,
   sunset). Connectors are neutral gray, independent of the preset. The canvas
   stays light in dark mode.
3. Dark mode recolors chrome only, through `data-theme="dark"` on the app root.
4. Brand violet `#6846E3` is for the logomark and avatar only. Chrome stays
   neutral gray.
5. Follow taste.md: small focused modules, functions near 10 lines, files 100–300
   lines, no abbreviations, reuse first, write tests, build minimum then iterate.

## Commands

The bench root is `~/Draw/frappe-bench`. The site is `test.localhost`.

Frontend (run from `frontend/`):

```bash
yarn dev
yarn build
yarn test
```

Frappe (run from the bench root):

```bash
bench --site test.localhost migrate
```
