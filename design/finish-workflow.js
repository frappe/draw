export const meta = {
  name: 'frappe-draw-v1-finish',
  description: 'Finish Frappe Draw v1: complete the 6 remaining feature areas (reading on-disk foundation + 7 done features), then integrate -> review -> fix',
  phases: [
    { title: 'Features', detail: 'the 6 quota-blocked areas flesh out their stub files' },
    { title: 'Integration', detail: 'wire everything, make yarn build pass' },
    { title: 'Review', detail: 'adversarial correctness + spec conformance + build' },
    { title: 'Fix', detail: 'apply high-severity findings, rebuild' },
  ],
}

const APP = '/Users/vibhavkatre/frappe-bench/apps/frappe_draw'
const FE = APP + '/frontend'

const PREAMBLE = `You are finishing Frappe Draw, a Vue 3 + frappe-ui SVG diagram editor, on a Frappe bench.
App: ${APP}  |  Frontend SPA: ${FE}  |  Site: test.localhost (run 'bench start' in background if not running).
The FOUNDATION and 7 feature areas are ALREADY BUILT and on disk (store, canvas pipeline, left palette,
selection/transform, connectors, text, right palette, keyboard). The app currently BUILDS GREEN. Your job is
to complete the remaining areas WITHOUT regressing what exists.

BEFORE writing ANY code you MUST read:
- ${APP}/design/CONVENTIONS.md (THE contract — store API, file layout, integration protocol)
- ${APP}/design/SPEC.md and ${APP}/design/README.md
- the EXISTING files in ${FE}/src (esp. stores/useDiagramStore.js, stores/useEditorUi.js, the canvas
  components, and your own stub files) so you match the real store API and style.

CARDINAL RULES: chrome = frappe-ui components + frappe-ui Tailwind tokens (bg-surface-white, text-ink-gray-9,
border-outline-gray-1, ...); NEVER import colors_and_type.css; canvas uses literal colors + --t* theme vars and
stays light in dark mode; right palette = GRID only; brand violet #6846E3 only on logomark/avatar; follow
${APP}/design/taste.md (small functions/files, no abbreviations, reuse).`

const OWNERSHIP = `STRICT FILE OWNERSHIP (other agents run in parallel): edit ONLY the files listed in YOUR
assignment. Your files already exist as minimal stubs (or partially built) — read each, then flesh it out IN
PLACE keeping the same export name / props / mount path. Do NOT edit main.js, App.vue, router.js, EditorShell.vue,
HomeShell.vue, the store, or other agents' files. Some files (e.g. the home screen) may already look complete —
read first and only improve/finish; do NOT regress working code. Do NOT run yarn build/install/dev or bench
commands (Integration handles building) EXCEPT the backend agent, which may run bench migrate for its own server
changes. If you need an npm dep, do NOT install it; list it in newDeps and code defensively.`

const FEATURE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'filesTouched', 'integrationNotes', 'newDeps', 'newRoutes'],
  properties: {
    area: { type: 'string' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    integrationNotes: { type: 'string' },
    newDeps: { type: 'array', items: { type: 'string' } },
    newRoutes: { type: 'array', items: { type: 'string' } },
  },
}
const INTEGRATION_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['buildPassed', 'wiredFiles', 'remainingIssues', 'notes'],
  properties: {
    buildPassed: { type: 'boolean' },
    wiredFiles: { type: 'array', items: { type: 'string' } },
    remainingIssues: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['buildPassed', 'findings'],
  properties: {
    buildPassed: { type: 'boolean' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['severity', 'file', 'issue', 'fix'],
      properties: {
        severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' },
      },
    } },
  },
}

phase('Features')
const featureAgents = [
  {
    label: 'toolbar',
    files: 'components/toolbar/TopToolbar.vue, TitleEditor.vue, SaveIndicator.vue',
    tasks: `Top toolbar (SPEC §4.4, README §4a). 48px bar: left = back chevron (to Home), violet logomark,
TitleEditor (click-to-edit inline title, default "Untitled diagram"; emits update:title — EditorShell already
binds @update:title to rename and passes :title + :save-status + :dark, and listens @toggle-dark), SaveIndicator
(green check "Saved" / "Saving..." from the save-status prop). Right = Export button (mount components/toolbar/
ExportMenu.vue), Share (mount ShareMenu.vue), Print icon, divider, dark-mode toggle (emit toggle-dark; chrome
only), violet avatar. Use frappe-ui Button/Dropdown/Tooltip/FeatherIcon. ExportMenu/ShareMenu exist (export agent
owns them) — just import + mount.`,
  },
  {
    label: 'floating+zoom-pan',
    files: 'components/floating/BottomPalette.vue; composables/useViewport.js; components/canvas/DiagramCanvas.vue (zoom/pan + dynamic pan-area only)',
    tasks: `Floating bottom-center palette + zoom/pan polish (SPEC §7.1/§7.7). BottomPalette pill bar: pointer modes
select/hand/draw (draw cursor = dotted plus) bound to editorUi.state.tool, grid toggle (editorUi.gridVisible),
zoom out / "{{zoomPercent}}%" reset-to-100 / zoom in / Fit. useViewport already has fit()/setMeasure()/handleWheel
— extend to: 10-400% in 10% steps, cursor-centered, via Shift-scroll OR Ctrl/Cmd-scroll OR Ctrl/Cmd +/-; plain
scroll pans; intercept browser ctrl-zoom. In DiagramCanvas add dynamic pan-area (stretch when a shape leaves the
paper, shrink when it returns; scrollbars when needed) WITHOUT breaking the existing fit-to-view + render. You are
the ONLY agent allowed to edit DiagramCanvas.vue and useViewport.js.`,
  },
  {
    label: 'home-screen',
    files: 'components/home/Sidebar.vue, TileGrid.vue, DiagramTile.vue, NewDiagramDialog.vue, TrashView.vue, FolderSection.vue, EmptyState.vue; data/folders.js; composables/useThumbnail.js; data/templates.js',
    tasks: `Home dashboard (SPEC §2, README §1-3). These files may already be largely built — READ them first and
only complete/polish; do NOT regress. Ensure: 240px sidebar (violet logomark, search, nav All/Shared/Trash,
Folders + add, user footer); main header + New diagram button opening NewDiagramDialog; tile grid with a dashed
create tile + DiagramTile (120px live SVG thumbnail via useThumbnail.documentToSvg, title, edited-time, hover ⋯
menu Rename/Edit description/Duplicate/Delete->trash no confirm); NewDiagramDialog with 4 type cards (Block enabled,
others Coming soon) + 6 starter templates from data/templates.js (already exists — keep its export shape
{ key, title, document }); TrashView with amber banner + Restore/Delete; FolderSection; drag tile into folder.
data/folders.js Draw Folder resources. Use diagrams resource in data/diagrams.js.`,
  },
  {
    label: 'guides+grid+bg',
    files: 'components/canvas/SmartGuidesLayer.vue, GridLayer.vue; composables/useSmartGuides.js',
    tasks: `Smart alignment guides + grid (SPEC §7.6/§4.1). useSmartGuides: while dragging a shape, compute
alignment of its edges/centers vs every other shape's edges/centers and canvas border/center on both axes
(axis-aligned bboxes, throttled to animation frames); emit guide lines + light snap (lock within a few px,
escapable). SmartGuidesLayer renders pink #E34AA6 dashed lines + a small label pill. GridLayer (already basic):
support dense/sparse densities from editorUi.gridDensity, under shapes, never exported. Expose a snapping hook the
selection/transform drag (composables/useShapeTransform.js — owned by another agent, do NOT edit it) can import
from useSmartGuides.js; coordinate via integrationNotes.`,
  },
  {
    label: 'export-share-print',
    files: 'composables/useExport.js, useShare.js; components/toolbar/ExportMenu.vue, ShareMenu.vue; components/viewer/ViewerPage.vue',
    tasks: `Export/share/print/viewer (SPEC §9/§10). useExport: client-side PNG (1x & 2x), JPEG (white bg for "no
color"), SVG, PDF — capture CANVAS BOUNDS not viewport, exclude grid; serialize the canvas <svg>, rasterize via an
offscreen canvas for PNG/JPEG; SVG/PDF preserve transparency (for PDF prefer a tiny dep — list in newDeps, do NOT
install — or a print-window fallback). ExportMenu/ShareMenu = frappe-ui Dropdown/Dialog (mounted by TopToolbar).
useShare: toggle is_public + copy link (call backend method if present, else the document resource). ViewerPage
(route /view/:name already wired): canvas only, no palettes, zoom/pan allowed, no export, "Made with Frappe Draw"
footer, access-denied state for private diagrams. Print: stylesheet prints canvas only.`,
  },
  {
    label: 'persistence+backend',
    files: 'composables/useAutosave.js; backend: frappe_draw/api/diagram.py (+ __init__.py) + hooks.py edits + permissions/role + purge job',
    tasks: `Persistence + backend (SPEC §8/§11.4, §2 trash, §9 sharing). useAutosave(store, diagramResource):
debounce ~1.5s after last change; save store.getDocument() via a whitelisted method; revision-check (stale ->
freeze "changed elsewhere — reload"); expose .status ('saved'|'saving'|'error') consumed by EditorShell/
SaveIndicator; hold unsaved in memory, flush on reconnect; offline freeze after ~5s. Backend api/diagram.py
(@frappe.whitelist): get_diagram(name) [owner or public], save_diagram(name, document, revision), list_diagrams,
trash/restore/duplicate, save_thumbnail; guest read only when is_public. Add a role normal users get + Draw Diagram
DocType perms with if_owner (read/write/create/delete own), keep System Manager full (apply via a patch under
frappe_draw/patches + patches.txt, or fixtures). Daily scheduled job purging Draw Diagram where is_trashed and
trashed_on older than 30 days; register in hooks.py scheduler_events. Run: cd /Users/vibhavkatre/frappe-bench &&
bench --site test.localhost migrate, and fix any error. Do NOT touch frontend files other than useAutosave.js.`,
  },
]
const features = await parallel(featureAgents.map((f) => () =>
  agent(`${PREAMBLE}\n\n${OWNERSHIP}\n\nYOUR AREA: ${f.label}\nYOUR FILES (only these): ${f.files}\n\nTASKS:\n${f.tasks}`,
    { schema: FEATURE_SCHEMA, agentType: 'general-purpose', label: f.label, phase: 'Features' })
))
const goodFeatures = features.filter(Boolean)
log(`Features done: ${goodFeatures.length}/${featureAgents.length}`)

phase('Integration')
const integration = await agent(`${PREAMBLE}

YOU ARE THE INTEGRATION AGENT. Make the whole app cohere and \`yarn build\` pass.
RECENTLY-COMPLETED FEATURE NOTES (JSON): ${JSON.stringify(goodFeatures, null, 1)}
DO: (1) Read EditorShell.vue, HomeShell.vue, router.js, TopToolbar.vue and confirm every component is imported
and mounted; wire anything flagged in integrationNotes (composables called in setup, menus mounted, routes,
provide/inject). (2) Install any newDeps actually imported: cd ${FE} && yarn add <pkg>. (3) cd ${FE} && yarn build
— fix EVERY error with minimal correct edits; re-run until clean. (4) If backend changed: cd /Users/vibhavkatre/
frappe-bench && bench --site test.localhost migrate (tail output, fix errors). Return the schema; buildPassed =
final \`yarn build\` result.`, { schema: INTEGRATION_SCHEMA, agentType: 'general-purpose', label: 'integration' })
log(`Integration buildPassed=${integration && integration.buildPassed}`)

phase('Review')
const reviewDims = [
  { label: 'review:build+wiring', focus: `Run \`cd ${FE} && yarn build\` and confirm it passes. Audit that every
feature is mounted and reachable (left/right palettes, toolbar menus, bottom palette, home tiles/dialog/trash,
editor + viewer routes, autosave wired). Flag dead imports, unmounted components, provide/inject mismatches, stubs
left unimplemented.` },
  { label: 'review:store+correctness', focus: `Audit store + geometry + mutating features: undo/redo integrity,
ids (no Math.random/Date), zIndex order, duplicate/connector-attachment rule, getDocument round-trips schema.js,
multi-select intersection, autosave revision-check. Cite file:line.` },
  { label: 'review:spec+frappeui', focus: `Conformance to SPEC.md + README.md + CONVENTIONS.md: chrome uses
frappe-ui + tokens (no colors_and_type.css, no es-btn/inline chrome), canvas uses --t* and stays light in dark
mode, right palette GRID only, fit-to-view+centered, Espresso-only color picker, brand violet only logomark/avatar,
export captures canvas bounds + excludes grid, viewer read-only.` },
]
const reviews = await parallel(reviewDims.map((r) => () =>
  agent(`${PREAMBLE}\n\nYOU ARE A REVIEW AGENT (read-only mindset; do NOT edit files). Adversarially review.
FOCUS:\n${r.focus}\nReturn findings (severity/file/issue/fix); cite paths. If build fails, buildPassed=false and
make it a critical finding.`, { schema: REVIEW_SCHEMA, agentType: 'general-purpose', label: r.label, phase: 'Review' })
))
const allFindings = reviews.filter(Boolean).flatMap((r) => r.findings || [])
const mustFix = allFindings.filter((f) => f.severity === 'critical' || f.severity === 'high')
log(`Review findings: ${allFindings.length} total, ${mustFix.length} critical/high`)

phase('Fix')
const fix = await agent(`${PREAMBLE}

YOU ARE THE FIX AGENT. Apply these critical/high findings, then ensure the build passes. Minimal correct edits,
no regressions; skip a finding if wrong and say why.
FINDINGS (JSON): ${JSON.stringify(mustFix, null, 1)}
After fixing: cd ${FE} && yarn build until clean; if backend changed, bench --site test.localhost migrate. Return
the integration schema (buildPassed = final build; remainingIssues = anything left).`,
  { schema: INTEGRATION_SCHEMA, agentType: 'general-purpose', label: 'fix' })
log(`Fix buildPassed=${fix && fix.buildPassed}`)

return {
  featuresCompleted: goodFeatures.length,
  integrationBuild: integration && integration.buildPassed,
  reviewFindings: allFindings.length,
  criticalHigh: mustFix.length,
  finalBuild: fix && fix.buildPassed,
  remainingIssues: fix && fix.remainingIssues,
}
