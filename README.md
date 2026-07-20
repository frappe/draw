<p align="center">
  <img src="draw/public/logo.svg" alt="Frappe Draw" height="80" />
</p>

<h1 align="center">Frappe Draw</h1>

<p align="center">
  One canvas for <b>mind maps, flowcharts, whiteboards & block diagrams</b> —
  with real-time co-editing and Writer-style sharing, right inside your Frappe site.
</p>

---

## One unified canvas

Frappe Draw puts every diagram type on a **single canvas** — no separate editors, no
type picker. Start drawing immediately, and pull in exactly what you need:

- **Insert menu** drops auto-laid-out **mind-map** and **flowchart** frames onto the canvas, like templates.
- **In-frame editing** — double-click any frame to focus it and edit with that type's full dedicated editor, then step back to the canvas.
- Mix mind maps, flowcharts, whiteboard sketches and block shapes in **one document**.

## Features

- **Mind maps** — auto-laid-out, balanced two-sided trees with keyboard-first editing, cross-links, markers and per-node styling.
- **Flowcharts** — typed nodes (process, decision, terminator, …), auto-routed orthogonal connectors, branch labels, auto-numbering and one-click tidy.
- **Block diagrams** — shapes, connectors with attached endpoints, alignment/distribution, rich text and a floating contextual toolbar.
- **Whiteboards** — pen, highlighter, partial eraser, sticky notes, tables, lines, laser pointer and image insert.
- **Real-time co-editing** — multiple people on the same canvas at once, with live cursors.
- **Sharing** — Writer-style **view / comment / edit** access per person, plus public or restricted general access, built on Frappe's native permissions.
- **Library** — organise diagrams into folders, pin favourites, search and filter; per-user and permission-scoped.
- **Navigation** — minimap, zoom/pan, fit-to-view, alignment guides and named sections.
- **Export** — PNG and PDF.
- **Desk app launcher** — appears in the Frappe `/apps` screen with its own icon.
- **Optional [Frappe Drive](https://github.com/frappe/drive) integration** — a diagram shows up in Drive as a file that opens right back in Draw.

## Installation

Install on any [Frappe](https://github.com/frappe/frappe) site using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/frappe/draw
bench --site your-site.localhost install-app draw
```

The Vue frontend is built automatically during install (via `bench build`). Then open
`https://your-site.localhost/draw`.

> Upgrading an existing install? Pull the latest and rebuild the frontend:
> ```bash
> bench get-app draw --branch main
> bench build --app draw && bench --site your-site.localhost clear-cache
> ```

### Frappe Cloud

Add the app to your bench group from `https://github.com/frappe/draw` (branch `main`),
let the deploy build it, then install it on a site and open `/draw`.

## Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/draw
pre-commit install
```

Pre-commit is configured to use ruff, eslint, prettier and pyupgrade. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## License

[GNU Affero General Public License v3.0](license.txt)
