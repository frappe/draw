# Frappe Draw

Diagramming for Frappe — create **mind maps, flowcharts, block diagrams and
freeform whiteboards**, with real-time co-editing, right inside your Frappe site.

## Features

- **Mind maps** — auto-laid-out, balanced two-sided trees with keyboard-first editing, cross-links, markers and per-node styling.
- **Flowcharts** — typed nodes (process, decision, terminator, …), auto-routed orthogonal connectors, branch labels and one-click tidy.
- **Block diagrams** — shapes, connectors with attached endpoints, alignment/distribution, rich text and a floating contextual toolbar.
- **Whiteboards** — pen, highlighter, partial eraser, sticky notes, tables, lines, laser pointer and image insert.
- **Real-time co-editing** — multiple people on the same canvas at once.
- **Library** — organise diagrams into folders, pin favourites, search and filter; per-user and permission-scoped.
- **Export** — PNG and PDF.

## Installation

Install on any [Frappe](https://github.com/frappe/frappe) site using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/frappe/draw
bench --site your-site.localhost install-app draw
```

Then open `https://your-site.localhost/draw`.

## Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/draw
pre-commit install
```

Pre-commit is configured to use ruff, eslint, prettier and pyupgrade. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## License

[GNU Affero General Public License v3.0](license.txt)
