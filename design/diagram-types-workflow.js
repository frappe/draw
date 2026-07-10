export const meta = {
  name: 'frappe-draw-diagram-types',
  description: 'Build the rest of the diagram-types spec: mind map M2-M6, flowchart F1-F5, whiteboard W1-W6 — foundation -> 3 parallel per-type agents -> integration -> review -> fix',
  phases: [
    { title: 'Foundation', detail: 'extend shared seams for flowchart + whiteboard (mirror M1), build green' },
    { title: 'Build', detail: 'one agent per diagram type builds all its steps (file-disjoint by folder)' },
    { title: 'Integration', detail: 'wire everything, yarn build + migrate green' },
    { title: 'Review', detail: 'per-type correctness + v1/M1 regression + spec conformance + build' },
    { title: 'Fix', detail: 'apply critical/high findings, rebuild' },
  ],
}

const APP = '/Users/vibhavkatre/frappe-bench/apps/draw'
const FE = APP + '/frontend'

const PREAMBLE = `You are extending Frappe Draw, a Vue 3 + frappe-ui SVG diagram editor on a Frappe bench.
App: ${APP}  |  Frontend SPA: ${FE}  |  Site: test.localhost (run 'bench start' in background if down).

A working v1 BLOCK editor already exists, AND Mind Map step M1 is already built and is your REFERENCE
PATTERN for how a diagram type layers onto the shared engine WITHOUT forking it. Before writing code, READ:
- ${APP}/design/diagram-types-spec.md  (THE spec — Parts 0,1,A,B,C,D,E,G; obey it, esp. the Part G pitfalls)
- ${APP}/design/CONVENTIONS.md          (store API, file layout, token rules)
- The M1 implementation, and MIRROR its structure for other types:
    ${FE}/src/diagram/modeStrategies.js, ${FE}/src/stores/useModeStrategy.js,
    ${FE}/src/diagram/schema.js (diagramType + mindmap sub-object + migrate),
    ${FE}/src/stores/useDiagramStore.js (state.diagramType/state.mindmap, attachMindMap, getDocument/loadDocument),
    ${FE}/src/stores/history.js (snapshot includes mindmap),
    ${FE}/src/diagram/mindmapModel.js, mindmapLayout.js, ${FE}/src/components/canvas/MindMapNodeLayer.vue,
    ${FE}/src/components/canvas/DiagramCanvas.vue (isMindmap routing + gated block interactions).
Also read neighbouring v1 components to match style (Part G9).

BINDING RULES (Part G):
- G1: ONE shared editor + mode strategies; never fork. Shared code changes are additive, behind the strategy seam.
- G2: ONE reactive store (useDiagramStore); stable ids via nextId() from diagram/factories.js — never array index.
- G3: do NOT regress v1 BLOCK or mind-map M1. They must still open/edit/save.
- G4: ONE screen<->canvas transform (useViewport via DiagramCanvas). Route EVERY new pointer interaction (pen,
  laser, sticky, double-click-create, drag, hit-test) through it; distances in canvas units; correct at 10/100/400% zoom.
- G5: keyboard handling is mode-aware AND guarded when a text field/editor is focused (arrows navigate in mindmap
  vs nudge in block; Tab/Enter preventDefault; letter keys only when a node selected & not editing; number keys only
  when not editing).
- G6: undo/redo on SEMANTIC model ops via store.commit(); layout is derived, never in the undo stack; Tidy/insert-
  reflow/paste-to-tree/delete-subtree are each ONE undoable unit.
- G7: build simplest-correct first then polish (mindmap already does right-then-balanced; flowchart needs a
  per-node manuallyPositioned flag so auto-place/reflow only move non-manual+new nodes, Tidy clears flags;
  whiteboard must simplify strokes (RDP) on pointer-up and hit-test path geometry not bbox).
- G8: ONE render-to-SVG path per type feeds canvas + export + thumbnail + viewer; frame the content bounding box;
  never export grid or laser trail.
- frappe-ui components + Espresso Tailwind tokens for chrome; canvas uses literal colors + --t* vars; Inter font;
  Espresso-only color picker; follow ${APP}/design/taste.md (small functions/files, no abbreviations, reuse).`

const OWNERSHIP = `STRICT FILE OWNERSHIP (other agents run in parallel). Edit ONLY files in YOUR diagram type's
folder/area plus the seam hooks the Foundation phase exposed for you. Do NOT edit other types' files, block files,
or the shared composition files (DiagramCanvas.vue, EditorShell.vue, router.js, useDiagramStore.js core,
schema.js, modeStrategies.js, NewDiagramDialog.vue) — Foundation already prepared those and created your stubs.
If you genuinely need a shared-file change, return it in integrationNotes for the Integration agent. Do NOT run
yarn build/install/dev or bench (Integration handles building); if you need an npm dep, list it in newDeps and code
defensively. Build on M1's already-working mind-map foundation; do not regress block or mindmap.`

const FEATURE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['area', 'stepsDone', 'filesTouched', 'integrationNotes', 'newDeps'],
  properties: {
    area: { type: 'string' },
    stepsDone: { type: 'array', items: { type: 'string' }, description: 'spec step ids completed, e.g. M2,M3' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    integrationNotes: { type: 'string' },
    newDeps: { type: 'array', items: { type: 'string' } },
  },
}
const BUILD_SCHEMA = {
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

// ---------------- Phase 1: Foundation ----------------
phase('Foundation')
const foundationPrompt = `${PREAMBLE}

YOU ARE THE FOUNDATION AGENT. Extend the shared seams so flowchart + whiteboard types layer on like mind map did,
and so the three per-type agents can work on DISJOINT files. Do NOT regress block or mindmap (test by reading; the
build must stay green). Implement:

1. schema.js: createDiagramDocument supports diagramType 'flowchart' and 'whiteboard', attaching the per-type
   sub-object (flowchart: { direction:'TB', nodes:[], edges:[] } with a pre-placed Start terminator node;
   whiteboard: { sketchStyle:false, strokes:[], stickyNotes:[] }). migrateDocument defaults them to null when absent.
   Mirror how mindmap is done.
2. useDiagramStore.js + history.js: hold state.flowchart and state.whiteboard; include them in snapshot/restore,
   getDocument, loadDocument. Add per-type mutation slices attachFlowchart(store,state,history) and
   attachWhiteboard(store,state,history) with the core mutations those editors need (add/update/remove node+edge for
   flowchart; add/update/remove stroke+stickyNote, and generic per-type model update for whiteboard), each via
   commit(). Keep block + mindmap untouched. Expose helpers the type agents will call (document their names in the
   return).
3. modeStrategies.js: add 'flowchart' and 'whiteboard' entries mirroring mindmap (rendersOwnLayer:true; flowchart
   isAutoLayout:false + hasBoundedPaper:true; whiteboard isAutoLayout:false + hasBoundedPaper:false). Add fields the
   seams need: e.g. handlesSurfaceInteraction:true for whiteboard/flowchart, and a paletteMode string.
4. DiagramCanvas.vue: route to <FlowchartLayer> / <WhiteboardLayer> by strategy (mirror the mindmap branch),
   reusing the shared viewport transform + contentExtent/fit (frame each type's content bbox). Establish a SURFACE
   INTERACTION DELEGATION seam: when modeStrategy.handlesSurfaceInteraction, route surface pointerdown/move/up/
   dblclick/wheel to a mode interaction object provided via inject('modeInteraction') (fall back to existing block/
   mindmap handling otherwise). Create minimal STUB components components/canvas/FlowchartLayer.vue and
   WhiteboardLayer.vue (valid SFCs rendering a placeholder) so the build passes; the type agents flesh them.
5. EditorShell.vue: provide a 'modeInteraction' ref that the active type's interaction composable can populate (or a
   simple registry the type composables register into). Keep useKeyboard mode-aware (see 7).
6. NewDiagramDialog.vue: enable the Flowchart and Whiteboard type cards (set enabled:true) and give each a starter
   title; chooseType already emits the type and createDiagram builds the starter doc.
7. useKeyboard.js: make the global key dispatcher mode-aware — branch on store.state.diagramType and delegate to a
   per-mode keyboard handler looked up from inject or a registry, guarded so shortcuts are ignored while a text
   editor/input is focused. Create stub per-mode handlers the type agents will flesh (composables/useMindmapKeys.js
   already may be needed by M2 — if mindmap agent owns it, just leave the seam). Keep block shortcuts working.
8. RightPalette.vue: make section composition mode-aware (render the block sections for block; for other modes,
   render a single mode palette component chosen by strategy.paletteMode). Create stub palette components
   components/palette-right/FlowchartPalette.vue and WhiteboardPalette.vue (MindMapPalette is owned by the mindmap
   agent for M6 — create a stub for it too so the build passes).
9. BottomPalette.vue: expose a seam for mode-specific tools (whiteboard adds pen/highlighter/eraser/text/sticky/
   laser) — render extra tools when strategy provides them; create the seam, leave the whiteboard tools to its agent.

cd ${FE} && yarn build until green. Return BUILD_SCHEMA-style info plus, in notes, the EXACT new store mutation
names/signatures per type and the names of the stub files + seam hooks (inject keys, registry function names) each
type agent must use.`

const foundation = await agent(foundationPrompt, { schema: BUILD_SCHEMA, agentType: 'general-purpose', label: 'foundation' })
log(`Foundation buildPassed=${foundation && foundation.buildPassed}`)

// ---------------- Phase 2: Build (parallel, one agent per diagram type) ----------------
phase('Build')
const ctx = `\n\nFOUNDATION RESULT (seams, store mutations, stub files, inject keys you must use):\n${foundation ? foundation.notes : '(read modeStrategies.js, useDiagramStore.js, DiagramCanvas.vue)'}\n`

const typeAgents = [
  {
    label: 'mindmap M2-M6',
    files: `diagram/mindmapModel.js, diagram/mindmapLayout.js, components/canvas/MindMapNodeLayer.vue,
components/palette-right/MindMapPalette.vue, composables/useMindmapKeys.js, composables/useMindmapInteraction.js,
components/canvas/MindMapOutline.vue (outline panel), plus any mindmap-only helper files you add`,
    tasks: `Finish Mind Map steps M2-M6 (spec Part A + E). M1 already built the model/layout/render/minimal-add.
M2 keyboard creation & navigation: Tab=child, Enter=sibling, Shift+Enter=newline, Esc=exit edit, Delete/Backspace=
delete node (confirm + delete subtree if it has children), arrows NAVIGATE (up/down siblings, left/right parent/
child), Shift+Tab=promote, Alt+Up/Down=reorder, double-click/click text=edit. New nodes enter edit mode. Guard all
when a text editor is focused (G5). Route through the mode keyboard seam + interaction seam from Foundation.
M3 curved bezier branch connectors parent->child (no arrowheads), branch coloring: each first-level branch gets an
Espresso color, descendants inherit (optionally lighten by depth), overridable; theme presets reassign. Replace M1's
placeholder straight lines.
M4 collapse/expand (toggle on nodes with children + count badge of hidden descendants; collapsed subtrees occupy
zero layout space) + drag node onto another to re-parent (block cycles into own descendant) + drag among siblings to
reorder. Each one undoable unit.
M5 paste multi-line indented/bulleted text onto a node -> build the matching subtree; node markers (one-click
Espresso icon + color dot); cross-link dotted optionally-labeled connector between any two nodes (rendered distinctly
from branch curves); node notes (hover + side panel). All persist in the mindmap document model.
M6 outline view side panel (indented editable; TWO-WAY sync with the map via the one model — no reactive loop, G10;
debounce); focus mode (dim/collapse all but selected branch); mind-map RIGHT PALETTE per A9 (node fill/text color,
font size, branch color, marker, collapse/expand all, focus toggle, outline toggle, theme presets; hide Arrange/
Align/Distribute/Same-size/Swap/Rotate) — flesh MindMapPalette.vue; empty state (root "Central idea", hint); fit-to-
view frames the tree. Keep layout O(n) and animating; cycle prevention covered by tests.`,
  },
  {
    label: 'flowchart F1-F5',
    files: `diagram/flowchartModel.js, diagram/flowchartLayout.js (orthogonal routing + column/lane snapping),
components/canvas/FlowchartLayer.vue, components/canvas/FlowchartNodeTypePicker.vue,
components/palette-right/FlowchartPalette.vue, composables/useFlowchartInteraction.js, composables/useFlowchartKeys.js,
plus flowchart-only helpers you add`,
    tasks: `Build Flowchart steps F1-F5 from scratch (spec Part B + E), mirroring the M1 mindmap pattern (model +
layout + layer + interaction + keyboard + palette), using the Foundation flowchart store slice + seams.
F1 five node types with designed defaults: Terminator (stadium/pill), Process (rectangle), Decision (diamond),
Input/Output (parallelogram), Connector/Junction (small circle). Render them in FlowchartLayer; theme presets color.
F2 extend-from-node creation: selecting/hovering a node shows "+" handles on its outgoing edge(s) (bottom in TB);
clicking opens FlowchartNodeTypePicker; choosing creates that node one level down, auto-connects with an arrowed
elbow connector, auto-positions snapped to the column/lane. Keyboard flow-building: with a node selected (not
editing) Enter=Process, D=Decision, T=Terminator, I=Input/Output.
F3 Decision nodes expose multiple labeled "+" outputs (default Yes/No, editable; more addable); branches auto-
balance symmetrically; labels stay attached through moves.
F4 connectors orthogonal/elbow with arrowheads, attach to logical ports (bottom->top), re-route as nodes move, no
obstacle-avoidance (offset overlapping routes slightly); midpoint labels; manual connectors allowed; drag a connector
from a port to empty canvas -> node-type picker -> create connected node there. Per-node manuallyPositioned flag (G7):
auto-place/reflow only move non-manual + newly inserted nodes.
F5 "Tidy up" re-flows whole chart (one undoable step; clears manuallyPositioned); node-type swap preserving edges;
insert-in-the-middle: drop a node onto a connector -> splice it in, downstream reflows (one undoable step); flow-
direction toggle TB<->LR re-lays-out. Flesh FlowchartPalette per B8. Deleting a node cleanly removes/stubs its edges
(no dangling). Unit-test routing/reflow/insert/swap edge-preservation.`,
  },
  {
    label: 'whiteboard W1-W6',
    files: `diagram/whiteboardModel.js, diagram/strokeSimplify.js (RDP), diagram/sketch.js (roughen helper),
components/canvas/WhiteboardLayer.vue, components/canvas/WhiteboardMinimap.vue,
components/palette-right/WhiteboardPalette.vue, components/floating/WhiteboardTools.vue (or extend the bottom-palette
seam), composables/useWhiteboardInteraction.js, composables/useWhiteboardKeys.js, plus whiteboard-only helpers`,
    tasks: `Build Whiteboard steps W1-W6 from scratch (spec Part C + E), mirroring the M1 pattern + Foundation
whiteboard store slice + the surface-interaction seam (all pointer math through the shared transform, G4).
W1 freely expanding canvas + double-click anywhere creates a text box (caret ready) + tool palette (Select, Hand,
Pen, Highlighter, Eraser, Text, Sticky, Shapes, Connector, Laser) wired to the active tool.
W2 vector pen: smoothed strokes (Espresso color + thickness); highlighter variant (semi-transparent, thick); width
in canvas units (respects zoom). Simplify stroke points with RDP on pointer-up (diagram/strokeSimplify.js) before
saving (G7); autosave waits for pointer-up.
W3 eraser deletes WHOLE strokes via path geometry hit-test (not bbox), undoable.
W4 sticky notes (Espresso colors, auto-contrast text; resizable/draggable); Tab after placing drops an adjacent
note; number keys 1-9 pick palette colors while sticky/pen active (only when not editing text, G5).
W5 hand-drawn sketch style toggle (per-object or board-wide) via a roughen pass over SVG output (diagram/sketch.js;
if you need a tiny roughen lib list it in newDeps, do NOT install — provide a hand-rolled fallback); laser pointer
leaving a self-fading trail (no persistent data, never exported, G8).
W6 hyperlinks: any object carries a link to a URL or another Frappe Draw diagram (navigate on click); minimap
(WhiteboardMinimap.vue) reflecting content + panning; context-sensitive WhiteboardPalette (pen->color+thickness,
sticky->color, shapes/text->base styling, sketch toggle, theme presets); empty-state hint. Flesh WhiteboardLayer to
render strokes + stickies + base shapes/connectors via the shared render path (G8). Simplify long stroke point-paths.`,
  },
]

const builds = await parallel(typeAgents.map((t) => () =>
  agent(`${PREAMBLE}\n\n${OWNERSHIP}\n\nYOUR DIAGRAM TYPE: ${t.label}\nYOUR FILES (only these + seam hooks): ${t.files}\n\nTASKS:\n${t.tasks}\n${ctx}`,
    { schema: FEATURE_SCHEMA, agentType: 'general-purpose', label: t.label, phase: 'Build' })
))
const goodBuilds = builds.filter(Boolean)
log(`Type builds done: ${goodBuilds.length}/${typeAgents.length}`)

// ---------------- Phase 3: Integration ----------------
phase('Integration')
const integration = await agent(`${PREAMBLE}

YOU ARE THE INTEGRATION AGENT. Foundation + 3 per-type agents have written code. Make the whole app cohere and
\`yarn build\` pass, without regressing block or mindmap.
PER-TYPE INTEGRATION NOTES (JSON): ${JSON.stringify(goodBuilds, null, 1)}
DO: (1) Confirm DiagramCanvas routes all four types; each type's layer, palette, keyboard handler and interaction
composable are mounted/registered via the Foundation seams; NewDiagramDialog enables all four; wire anything in
integrationNotes. (2) Install any newDeps actually imported: cd ${FE} && yarn add <pkg>. (3) cd ${FE} && yarn build —
fix EVERY error with minimal correct edits; re-run until clean. (4) cd ${FE} && yarn test — fix failing unit tests
(or obvious test bugs); keep them green. (5) If backend changed: cd /Users/vibhavkatre/frappe-bench && bench --site
test.localhost migrate. Return BUILD_SCHEMA; buildPassed = final yarn build result.`,
  { schema: BUILD_SCHEMA, agentType: 'general-purpose', label: 'integration' })
log(`Integration buildPassed=${integration && integration.buildPassed}`)

// ---------------- Phase 4: Review ----------------
phase('Review')
const reviewDims = [
  { label: 'review:build+wiring', focus: `Run cd ${FE} && yarn build AND yarn test; confirm both pass. Verify all
four diagram types are creatable from NewDiagramDialog and open in their mode (block, mindmap, flowchart, whiteboard),
each with its own layer + palette + keyboard + interactions mounted via the seams. Flag dead imports, unmounted
components, provide/inject mismatches, unimplemented stubs.` },
  { label: 'review:mindmap', focus: `Audit mind map M2-M6 vs spec Part A + Part G: keyboard mode-aware + text-edit
guarded (arrows navigate not nudge), Tab/Enter preventDefault; delete-subtree confirm; cycle prevention on re-parent;
collapsed subtrees occupy zero layout space + count badge; curved branch connectors + branch coloring cascade; paste-
to-tree; markers/cross-links/notes persist; outline two-way sync with NO reactive loop (G10); undo on semantic ops
(G6). Cite file:line.` },
  { label: 'review:flowchart+whiteboard', focus: `Audit flowchart F1-F5 + whiteboard W1-W6 vs spec Parts B/C + G:
flowchart orthogonal routing follows moved nodes + no dangling edges on delete + manuallyPositioned flag (auto-place
only moves non-manual+new) + Tidy/insert-reflow each one undoable unit + node-type swap preserves edges + decision
labels stay attached; whiteboard strokes simplified on pointer-up (RDP) + erase hit-tests path geometry not bbox +
pen width in canvas units (zoom) + sticky auto-contrast + number/Tab keys guarded + laser non-exported/non-persistent
+ all pointer math through the one transform (G4). Cite file:line.` },
  { label: 'review:regression+spec', focus: `Confirm v1 BLOCK and mind-map M1 still work (open/edit/save; block
shape draw/move; mindmap balanced layout) — read the gated code paths in DiagramCanvas + store to ensure additive,
non-regressive changes (G3). Check chrome uses frappe-ui + Espresso tokens (no colors_and_type.css, no inline-style
chrome), Espresso-only color picker, Inter font, render-to-SVG path reused for export/thumbnail (G8). Flag deviations.` },
]
const reviews = await parallel(reviewDims.map((r) => () =>
  agent(`${PREAMBLE}\n\nYOU ARE A REVIEW AGENT (read-only mindset; do NOT edit files). Adversarially review.
FOCUS:\n${r.focus}\nReturn findings (severity/file/issue/fix); cite paths. If build or tests fail, buildPassed=false
and make it a critical finding.`, { schema: REVIEW_SCHEMA, agentType: 'general-purpose', label: r.label, phase: 'Review' })
))
const allFindings = reviews.filter(Boolean).flatMap((r) => r.findings || [])
const mustFix = allFindings.filter((f) => f.severity === 'critical' || f.severity === 'high')
log(`Review findings: ${allFindings.length} total, ${mustFix.length} critical/high`)

// ---------------- Phase 5: Fix ----------------
phase('Fix')
const fix = await agent(`${PREAMBLE}

YOU ARE THE FIX AGENT. Apply these critical/high findings, then ensure build + tests pass and v1/M1 are not
regressed. Minimal correct edits, no regressions; skip a finding if wrong and say why.
FINDINGS (JSON): ${JSON.stringify(mustFix, null, 1)}
After fixing: cd ${FE} && yarn build && yarn test until clean; if backend changed, bench --site test.localhost
migrate. Return BUILD_SCHEMA (buildPassed = final build; remainingIssues = anything intentionally left).`,
  { schema: BUILD_SCHEMA, agentType: 'general-purpose', label: 'fix' })
log(`Fix buildPassed=${fix && fix.buildPassed}`)

return {
  foundationBuild: foundation && foundation.buildPassed,
  typeBuildsCompleted: goodBuilds.length,
  stepsDone: goodBuilds.flatMap((b) => b.stepsDone || []),
  integrationBuild: integration && integration.buildPassed,
  reviewFindings: allFindings.length,
  criticalHigh: mustFix.length,
  finalBuild: fix && fix.buildPassed,
  remainingIssues: fix && fix.remainingIssues,
}
