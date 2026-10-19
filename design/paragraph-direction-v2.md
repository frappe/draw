# Paragraph direction v2: architecture and implementation record

Status: Phase 2 source implementation completed after the user's `continu` approval. Manual application verification remains outstanding.

## 1. Scope and investigation record

Repository: `/home/weinno/projects/frappe-draw`.
Branch inspected: `Rtl-Paragraph`, tracking `origin/Rtl-Paragraph`.
The working tree was clean before this document was added.
The previous toolbar change is already present in the checked-out source.

This proposal covers text-bearing objects in the shared `shapes[]` model.
These include rectangles, squares, text boxes, other catalog shapes, and migrated mind-map or flowchart nodes.
Whiteboard text boxes also use this model.
Images, connector labels, sticky notes, table cells, and legacy framed sub-model nodes have different editing contracts.
They do not gain a direction command through this proposal.
Extending those separate editors requires a separate approved scope.

Read: `CLAUDE.md`, `design/CONVENTIONS.md`, `design/SPEC.md`, `design/README.md`, and `design/taste.md`.
`design/paragraph-direction.md` is absent in this checkout, despite the IDE tab.
Do not recreate or overwrite it.
No applicable `AGENTS.md` was found in the repository or the inspected ancestor directories.

Installed skills read, with exact paths:

- `/home/weinno/projects/frappe-draw/.agents/skills/code-style/SKILL.md`
- `/home/weinno/projects/frappe-draw/.agents/skills/ui-design/SKILL.md`
- `/home/weinno/projects/frappe-draw/.agents/skills/technical-writing/SKILL.md`
- `/home/weinno/projects/frappe-draw/.agents/skills/frappe-app-dev/SKILL.md`
- `/home/weinno/projects/frappe-draw/.agents/skills/frappe-code-review/SKILL.md`

The documented bench skill directories were unavailable at the inspected locations:
`/home/weinno/Draw/frappe-bench/.claude/skills` and `/home/weinno/projects/frappe-bench/.claude/skills`.
No installed skill named `quality-code-review` was found in the inspected repository or user skill directories.
Use `frappe-code-review` as the available equivalent.
The Frappe skill confirms the existing-app approach. No backend or bench operation is required.

Repository engineering conventions take precedence over general skill suggestions.
In particular, do not add the UI skill's floating tweak panel.
The user's approval gate and manual testing policy override normal implementation and testing workflows.
No automated tests, browser sessions, builds, lint, bench operations, deployment, commits, or pushes ran during this investigation.

## 2. Existing architecture

### 2.1 Selection and toolbar

`CanvasToolbar.vue` mounts `TextGroup.vue` when its shape-selection branch has eligible text shapes.
`useSelectionContext.js` selects block, whiteboard, or legacy diagram chrome.
`useBlockSelection.js` resolves selected objects and filters them through `canHoldText()` in `diagram/shapeText.js`.
That predicate excludes images. Presence of `shape.text` alone does not establish eligibility.

`useBlockSelection.editing` currently means `Boolean(activeEditor.value)`.
It does not check the current store, editing shape, selection ownership, or editor destruction.
`TextGroup.setTextAlign()` uses two paths:

1. Editing: `richCommands.setAlign()` updates Tiptap paragraphs.
2. Selection: `store.updateShapes()` updates `text.align` on eligible shapes.

Paragraph Direction has only the first path.
Its popover has `v-if="editing"`, and its computed state returns null outside editing.

### 2.2 Rich text and commands

The editor is Tiptap v3 with ProseMirror, not a plain textarea.
`useRichText.js` registers StarterKit, TextStyle, Color, TextAlign, and ParagraphDirection.
`TextEditor.vue` mounts HTML editing inside SVG `foreignObject`.
`useTextEditing.js` maintains a shared editing session with shape or connector IDs.
Starting shape editing also selects that shape.

The command path is:

```text
TextGroup -> richCommands.setDirection()
          -> activeEditor.chain().focus().setParagraphDirection()
          -> selectedParagraphs() -> transaction.setNodeMarkup()
          -> paragraph dir attribute -> editor DOM
          -> TextEditor.commitShape() on blur/Escape
          -> shape.text.html + shape.text.content -> store -> autosave/Yjs
```

`paragraphDirection.js` changes only paragraph nodes.
It preserves their other attributes and does not deliberately rebuild marks or lists.
`paragraphDirectionState()` treats absent direction as LTR.
A transaction listener in `useRichText.js` supplies reactive revisions.
Therefore a missing transaction subscription is not a confirmed cause.

The extension also persists a duplicate `dir` attribute on list items.
`syncListItems()` copies the first paragraph's direction after document changes.
Its HTML parser uses `closest('[dir]')`, which can turn an inherited direction into a paragraph override.

### 2.3 Display, measurement, and export

`ShapeView.vue` renders sanitized rich HTML inside `foreignObject`.
It shares `textStyleCss()` and `.fd-richtext` styles with the editor.
Ordinary legacy plain labels use a centered SVG `text` element without direction metadata.
Plain migrated node labels use an HTML wrapper instead.
`useAutoFitText.js` measures the committed rich wrapper.
Its watched inputs currently omit shape direction because that property does not exist.

Editor growth uses DOM height for wrapping shapes.
Fit-width boxes use `textMetrics.textWidth()` and list layout text.
Mind-map and flowchart sizing also use shared heuristic layout text.
These measurements are not a complete rich-text layout engine.

`useThumbnail.js` implements a separate document-to-SVG renderer.
`shapeText()` selects `shapeDirectedText()`, `shapeListText()`, or a plain SVG fallback.
`richTextLists.js` extracts flattened line records from sanitized HTML.
It loses inline marks, empty paragraphs, and distinctions between multiple paragraphs inside one list item.
Without a list or a `dir` attribute, it uses the plain-text fallback.

`shapeDirectedText()` supplies SVG direction and direction-aware anchors.
However, `wrapListLines()` prepends markers to text and uses character-count wrapping.
The directed renderer then ignores its continuation-line x coordinate.
This loses proper hanging indentation and marker isolation.
Export uses a 1.35 line-height factor, while editing uses 1.3.

`useExport.js` calls `documentToSvg()` for SVG, PNG/JPEG, selection exports, clipboard images, and print.
The jsPDF path rasterizes the SVG to PNG before embedding it.
It does not provide vector text in that path, despite an existing comment.
A direction fix in `ShapeView` alone cannot fix these outputs.

### 2.4 Persistence, history, and collaboration

`useDiagramStore.js` deep-merges nested text patches.
`getDocument()` and `loadDocument()` clone complete shape objects.
Duplication and `useClipboard.js` clone shapes, including HTML and unknown text fields.
`schema.js` preserves nested shape text data. Its current schema version is 2.
`draw/api/diagram.py::_normalize_document()` validates JSON, without filtering text fields.

Tiptap owns undo during live editing. Store snapshot history owns committed object edits.
`TextEditor` commits text on editing exit. While editing, text changes are not continuously written to the store.
Autosave watches the store, not the live Tiptap document.

`useCollaboration.js` maps each entire shape to a JSON string in a Yjs map.
Different shapes merge independently. Concurrent edits to the same shape use whole-object conflict resolution.
There is no character-level Tiptap collaboration binding.
Direction metadata can travel with the existing shape JSON, but that does not make simultaneous text edits merge safely.

## 3. Findings and confidence

| Problem | Classification | Evidence and consequence |
|---|---|---|
| Paragraph disappears outside editing | Confirmed from code | `TextGroup.vue` gates its popover with `v-if="editing"`. Alignment has no such gate. |
| No shape direction command | Confirmed from code | The menu calls only `richCommands.setDirection()`. There is no shape default field or store path. |
| Popover can end editing | Confirmed mechanism, likely explanation for flicker | `TextEditor.onBlur` always commits and clears `activeEditor`. Installed frappe-ui Popover uses Reka focus scopes. Mousedown suppression does not suppress autofocus. Runtime event ordering remains unverified. |
| Trigger disappears after that blur | Confirmed conditional consequence | Clearing `activeEditor` makes `editing` false and unmounts Paragraph. The surrounding toolbar also restores shape controls. |
| Stale editing ownership is possible | Confirmed lifecycle gap, runtime occurrence unverified | `editing` tests a global editor reference. `TextEditor` does not explicitly clear that reference on unmount. Readouts guard destruction, but the visibility predicate does not. |
| Icon identifier is missing | Not supported by source evidence | `arrow-left.svg` and `arrow-right.svg` exist in installed `lucide-static/icons`. Tailwind scans static source strings. No missing registration is demonstrated. Generated CSS and live appearance were not inspected. |
| Trigger is unlabeled visually | Confirmed from code | `ToolbarButton` uses `icon`, which produces an icon-only button. `label` becomes the accessible name. |
| Direction command always fails | Not confirmed | With a valid active editor and paragraph selection, the transaction writes `dir`. HTML display preserves it. A blanket failure claim would be unsupported. |
| Direction can become a no-op | Confirmed conditional paths | `run()` returns false without an active editor. No shape path exists. A blur before the menu action can remove its target. Unsupported text blocks are not selected by `selectedParagraphs()`. |
| Export drops shape defaults | Confirmed absence | Neither the data model nor `shapeText()` has shape direction input. Plain SVG display also lacks it. |
| RTL list gutter differs from marker direction | Confirmed from code | The list container retains inherited application LTR direction and start padding. RTL `li` receives an extra start margin. There is no coherent container/item gutter policy. Exact browser appearance is unverified. |
| Export list layout differs | Confirmed from code | Markers become part of the text run. Continuation indentation is discarded by the directed branch. Nested/multi-paragraph structure is flattened. |
| Auto is missing | Confirmed from code | `validDirection()` accepts only LTR/RTL. The extension, sanitizer, and menu cannot retain Auto. No first-strong resolver exists. |
| Content is lost in existing serialization | Not demonstrated | Shape cloning and JSON storage retain HTML. The main proven gaps are command ownership, missing modes, and rendering consistency. |

The existing tests were read, not executed.
They assert attributes and isolated commands, not actual marker geometry or popover focus behavior.
`e2e/specs/paragraph-direction.spec.js` still opens Alignment to find Paragraph.
It predates the dedicated control and is stale evidence for the current interface.

## 4. Recommended direction model

### 4.1 Stored modes and precedence

Keep HTML as the rich-text storage format. Do not add a second persisted rich document.
Add optional `shape.text.direction`: `auto`, `ltr`, or `rtl`.
Keep paragraph `dir`: null, `auto`, `ltr`, or `rtl`.
Null means inheritance. Auto means an explicit request to resolve from this paragraph's content.
The same rules cover supported heading and code-block text nodes imported through StarterKit.
Blockquote paragraphs remain ordinary paragraphs.

Choose a mode first, then resolve it:

```text
paragraph.dir is present -> use that mode, including Auto
otherwise shape.text.direction is present -> use that mode
otherwise -> legacy LTR mode

mode LTR/RTL -> use that direction
mode Auto -> first strong content character -> LTR/RTL
no strong character -> fixed content fallback LTR
```

Paragraph Auto intentionally overrides an explicit shape mode.
That distinction requires null inheritance and explicit Auto to remain different values.
No mode depends on the application's navigation direction.
The fixed fallback avoids different results across collaborators or export environments.

New eligible shapes explicitly receive `text.direction = 'auto'`.
Old shapes without the property preserve legacy LTR base direction.
Existing paragraph `dir` values remain explicit overrides.
Do not infer whether an old explicit attribute was originally generated by inheritance.
That intent cannot be recovered reliably.

### 4.2 Whole-shape semantics

When editing is inactive, selecting a mode means **apply to all text in each eligible selected shape**.
The command sets the shape default and clears paragraph direction overrides.
It also removes the previous implementation's redundant list-item direction metadata.
It changes no text, marks, list hierarchy, numbering, or alignment.

This rule makes a shape-level RTL command visibly affect previously explicit paragraphs.
The menu explains: “Applies to all paragraphs in selected shapes.”
Afterward, editing a paragraph can establish an override again.
Changing only the default while preserving every override was considered and rejected as the primary command.
It can look broken when every paragraph already has an explicit direction.
A separate default-only advanced command is outside this scope.

The batch operation computes each shape's new HTML before mutation.
One store commit applies all patches and runs the existing node fitting hooks.
It skips images and IDs outside the eligible shared shape selection.
Do not loop `updateShape()` into separate undo steps.
Plain-only legacy text does not need HTML conversion merely to set the default.
Creation defaults must not overwrite a supplied text block during duplication or paste.
Creation paths that supply a complete text block must opt into Auto explicitly.

### 4.3 Editing semantics and APIs

A store-scoped `useTextDirection()` facade owns context selection, not document state.
It exposes read-only state `{ context, mode, effectiveDirection, mixed, inherited }` and `setMode(mode)`.
It uses `useBlockSelection` and the active editing session, without re-deriving chrome type.

- `context = shape`: invoke `store.setTextDirection(ids, mode)`.
- `context = paragraph`: invoke `richCommands.setDirection(mode)` on the editor belonging to that session.
- No eligible target: disable or omit the control through the existing text-group gate.

The editor path changes selected text blocks in one ProseMirror transaction.
A collapsed selection targets its containing text block.
A range targets intersecting blocks, excluding a following block touched only at its opening boundary.
Unselected blocks stay unchanged. Commands keep the selection bookmark and other attributes.

Paragraph mode does not write the shape default.
Enter and list splitting inherit the source paragraph's stored mode, including null or Auto.
An inherited new paragraph follows the shape default.
An Auto paragraph resolves independently after typing or paste.
Backspace/join keeps the surviving destination paragraph's mode, matching the structural join operation.
Tab and Shift+Tab retain paragraph attributes while changing list depth.

List-item marker direction derives from its first direct text paragraph.
Later paragraphs within that item can differ without changing the marker.
The first paragraph's mode is canonical. Do not persist a second list-item direction value after normalization.
Import explicit list/container `dir` into child paragraphs only where needed to preserve external paste appearance.
Do not copy the editor's shape wrapper direction into paragraph attributes.

### 4.4 Automatic resolution

Extend `diagram/textDirection.js` with one pure resolver used by every adapter.
Use Unicode Bidi_Class L, R, and AL, following the paragraph-level first-strong rule.
R and AL resolve RTL. L resolves LTR. Weak numeric characters and neutrals do not choose a direction.
Iterate Unicode code points, including supplementary-plane characters.
Honor isolate boundaries when determining the containing paragraph's first strong character.
Preserve any control characters already present in pasted content, but never insert them.

Use compact checked-in ranges generated from a pinned Unicode `DerivedBidiClass.txt` release.
Include provenance, Unicode version, license attribution, and the source's default-range rules.
The range data classifies first-strong characters only. The browser performs full bidi shaping and ordering.
Do not implement the entire Unicode Bidirectional Algorithm.
Do not use script-name regular expressions or treat every letter outside an RTL block as LTR.

Official references:

- [Unicode Bidirectional Algorithm, paragraph level](https://www.unicode.org/reports/tr9/#Resolving_Embedding_Levels)
- [Unicode Derived Bidi Class data](https://www.unicode.org/Public/UCD/latest/ucd/extracted/DerivedBidiClass.txt)

Pin the concrete data release during approved implementation, rather than importing “latest” at runtime.
No runtime network request or added package is needed.

Resolve the complete logical paragraph before wrapping it.
Do not resolve each visual line independently.
Cache by paragraph content and mode in editor plugin state where useful.
Recompute for document changes, paste, deletion of the first strong character, or changed shape defaults.
Appending a different script after the first strong character does not flip direction.
Do not add keystroke timers or write detected results back into HTML.

Expected examples:

| Content in Auto mode | Effective direction |
|---|---|
| `سلام، این پروژه از Vue 3 استفاده می‌کند.` | RTL |
| `This project supports زبان فارسی.` | LTR |
| `123 - سلام دنیا` | RTL |
| `123 - Hello World` | LTR |
| `😊 (2026) مرحبا بالعالم` | RTL |
| `שלום עולם` | RTL |
| `123 - 😊` or empty text | LTR fallback |

Explicit RTL with English content remains RTL. Explicit LTR with Persian content remains LTR.
Choosing Auto restores content-based resolution.

## 5. State, focus, and toolbar architecture

```text
selection context + editing session
                |
        useTextDirection facade
           /                  
 shape batch command       paragraph command
           |                    |
 shape.text.direction     Tiptap text-block dir
           \                  /
            shared direction resolver
                      |
     +----------------+----------------+
     |                |                |
 editor decorations  HTML display   SVG paragraph layout
     |                |                |
 native bidi/lists   native bidi/lists  native SVG bidi + isolated markers
                      |
       committed shape JSON -> history / autosave / Yjs
```

### 5.1 Stable contextual control

Render a dedicated Paragraph control immediately after Alignment and before Text colour.
Use the same outer `TextGroup` eligibility gate as Alignment.
Remove the inner editing-only visibility condition.
The control remains mounted when changing between shape selection and editing of that shape.

Use installed `lucide-pilcrow` as the stable trigger icon.
`pilcrow.svg`, `pilcrow-left.svg`, and `pilcrow-right.svg` exist in the installed icon pack.
Keep icon identifiers as complete static strings for Tailwind scanning.
Do not use an arrow as a substitute for paragraph identity.
Use an accessible name and tooltip “Paragraph direction.”
Compact icon triggers follow the current Alignment pattern.
The open menu uses visible labels Automatic, Left-to-Right (LTR), and Right-to-Left (RTL).
Use checked radio-style state with native keyboard behavior and visible focus.
The trigger is a menu control, not an `aria-pressed` toggle.

Show “Automatic — RTL” or “Automatic — LTR” in menu status when resolved uniformly.
Show “Mixed” without a selected radio when selected modes differ.
If all modes are Auto but resolutions differ, keep Automatic selected and show “mixed directions.”
Inherited mode is shown with “From shape.” A separate inherited-mode command is optional, not required.
For selected shapes, a status line warns that the command applies to all their paragraphs.
If paragraph overrides vary, report that variation even when shape defaults agree.

### 5.2 Focus and editing ownership

The installed frappe-ui Popover wraps Reka PopoverContent.
It does not forward `openAutoFocus` or `closeAutoFocus` events through its public API.
Adding those listeners to this wrapper would not solve focus loss.
Do not modify installed dependencies.

Keep frappe-ui Popover and ToolbarButton.
Add an application-level formatting-focus scope shared by Alignment, Paragraph, and the folded decoration menu.
`useTextFormatting.js` registers open formatting surfaces against a store and editing-session token.
Its opening intent is registered synchronously before popover autofocus can blur the editor.
Content roots carry scope ownership attributes. The editor's selection bookmark remains in ProseMirror state.

While focus moves within the editor or its registered formatting surface, `onBlur` does not end the session.
A document focus listener and explicit outside-interaction handlers end it when focus leaves that scope.
Pointer exit to the canvas commits even when the pointer target is not focusable.
Closing after a command or Escape restores the original editor selection and focus.
Closing because the user selected another object preserves that destination and does not steal focus back.
Keyboard entry may focus menu options while keeping the editing session alive.
Do not globally suppress blur or depend only on `relatedTarget`, which can be null.

Use the existing popover's open/close events and content pointer/focus events.
If ordering cannot be expressed through this installed API, use a local adapter around the installed Reka primitives.
That contingency requires the same frappe-ui Button and surface tokens, with no dependency fork or floating toolbar.
Record the adapter decision before changing the approved file set.

`useRichText` tracks active editor ownership by store and target shape/session.
`useBlockSelection.editing` validates ownership and destruction rather than reference truthiness.
`TextEditor` clears the active editor and focus-scope registrations on unmount and target changes.
Queued menu commands validate the captured session token before dispatch.
An action from a closed editor must never format another shape or a connector label.

### 5.3 Toolbar width decision

The repository declares no spare width in the densest 1280px selection state.
A permanently available Paragraph trigger therefore needs a compensating reduction.
Recommended: replace separate Underline and Strikethrough buttons with one Text decoration popover.
Keep Bold and Italic direct. Keep Underline and Strikethrough available inside that popover.
This frees one trigger slot for Paragraph, with no change to the fixed prefix or selection groups.
Alignment and Paragraph remain adjacent, independent controls.

This changes formatting discoverability and requires approval.
Use compact icon triggers to avoid consuming the recovered width with text labels.
Actual fit, clipping, focus rings, and dark-mode contrast require manual verification at 1280px.
Do not claim width parity from button count alone.

## 6. Rendering and list layout

### 6.1 Shared paragraph representation

Extend `richTextLists.js` with a structured paragraph projection from sanitized HTML.
Retain the existing `richTextLines()` API as a compatibility projection for current callers.
Do not change Markdown conversion semantics incidentally.

The structured projection retains:

- Each text block, including empty paragraphs and explicit line breaks.
- Stored mode, resolved direction, and explicit paragraph alignment.
- Inline runs with existing marks and color.
- List type, start number, marker style, depth, and parent/item relationships.
- Several paragraphs belonging to one list item.

Use a DOM traversal, not string regular expressions, to change rich-text direction attributes.
The shape command removes only direction metadata within the sanitized tree.
Limit removal to block/list direction defaults and overrides owned by this feature.
Keep explicit inline direction and isolation where the existing rich-text schema supports them.
Preserve every supported mark, list attribute, alignment, and text node.
HTML remains the persisted source. The projection and resolved direction are derived values.

### 6.2 Live editor and committed HTML

Keep `dir` on Tiptap text blocks as the stored mode.
Derive effective DOM direction through ProseMirror node decorations.
Apply derived marker direction to `li` decorations, without list-item document attributes.
Decorations do not enter `getHTML()` or history.
Changing direction itself remains one history transaction, separated from adjacent typing groups.

For committed display, project effective direction into a sanitized render-only HTML tree.
Do not write that rendered tree back to the store.
Both adapters call the same resolver and layout policy.
The editor must serialize modes, including explicit Auto, rather than its decorated DOM attributes.

Introduce a shared rich-text stylesheet imported by editor and committed rendering.
Lists use a consistent gutter reserved on both sides for mixed-direction siblings.
Remove the current container-start-padding plus RTL-item-margin combination.
Each `li` receives its resolved direction. Native outside markers then use that item's logical start.
Nested lists create their own symmetric gutter inside the parent item.
Uniform RTL nesting therefore progresses from the right. Mixed children retain their own marker side.
This consumes symmetric inset space, which is a deliberate cost for predictable mixed lists.

Native `ul`/`ol` structure and numbering remain intact.
No reversal of strings, DOM children, numbering, or indentation arrays occurs.
Enter, Backspace, Tab, Shift+Tab, toggle-list, sink, and lift retain the existing Tiptap commands.
The direction extension does not rebuild lists to change mode.
Number style remains independent from direction.
Do not promise numbering formats that the existing Tiptap list schema cannot persist.
Existing supported decimal starts and native bullet behavior must remain unchanged.

### 6.3 Alignment

Direction commands never write `text.align` or paragraph `textAlign`.
Existing center/left/right values remain physical alignment decisions.
Factory defaults currently store center for ordinary shapes and left for fit-width canvas text.
Their provenance is unknown after saving. Preserve these values even when they were probably defaults.

When alignment is truly absent, use logical `start`.
An RTL paragraph then starts on the right, and an LTR paragraph starts on the left.
Existing shape center alignment remains centered in either direction.
Do not add a persisted “explicit alignment” flag or guess users' past intent.
List markers stay at logical start even when paragraph text is deliberately centered or oppositely aligned.

### 6.4 Plain labels, measurement, and export

For a shape with direction metadata, route plain content through the same paragraph rendering adapter.
Build paragraphs from newline-separated text with escaping, without rewriting saved content.
Preserve the existing plain SVG branch for untouched legacy labels without direction metadata.
Ensure the plain node-role branch follows the same direction rules.

Add direction and resolved layout inputs to autofit invalidation.
Retain existing node geometry and sizing entry points.
Fit-width measurements must include list gutters and marker advance without inserting measurement characters into content.
Recheck font fallback and mixed-script dimensions manually.

Replace export's directed/list text forks for affected shapes with one SVG paragraph-layout adapter.
Use the structured projection and shared text-area geometry.
Resolve direction once before line wrapping.
Keep markers separate from paragraph text and render them in their own isolated SVG text elements.
Use native SVG direction and Unicode isolation for text runs and marker runs.
Calculate physical anchors from alignment and base direction.
Place continuation lines at the content edge, not the marker edge.
Keep nesting in logical coordinates and preserve numbering starts.

Use the existing text measurement utilities, extended for marked runs where needed.
Use the chosen font family and 1.3 line-height consistently.
SVG `tspan` runs preserve supported font, color, and decoration marks.
Do not manually position individual bidi characters or reverse runs.
Existing unmodified legacy output keeps its fallback until it opts into direction/list rendering.

The adapter feeds the existing `documentToSvg()` path.
PNG, PDF, thumbnails, selection export, and print inherit the same direction and marker geometry.
Do not replace exports with `foreignObject` in this change.
That alternative improves HTML parity but introduces SVG-consumer and rasterization compatibility risks.
Exact line breaks and font appearance across SVG viewers remain a manual acceptance requirement, not a proven guarantee.

## 7. Persistence and compatibility decisions

Add optional metadata without a database migration or global document rewrite.
Keep schema version 2 because the change is additive and absent fields have defined behavior.
Document this exception to the schema header's general version-bump instruction.
The current schema already uses lazy fallback for additive optional fields.

- New creation paths explicitly opt eligible shapes into Auto.
- Loaded legacy shapes keep absent direction and previous appearance.
- Existing explicit paragraph directions remain explicit until a whole-shape command clears them.
- Only an actual direction command normalizes old redundant list-item direction attributes.
- The sanitizer allows exactly Auto/LTR/RTL for semantic `dir` and does not broaden other HTML privileges.
- Copy/paste within the app and duplication retain the shape default and paragraph modes through full-object cloning.
- Rich-text paste preserves explicit imported directions. Plain paste inherits the destination paragraph mode.
- No detected direction, decoration, menu state, or focus token is serialized.

Keep the current commit-on-edit-exit model.
Direction changes are visible immediately in the editor and persist with the editing session when it commits.
Before export/navigation, finish the current edit through the existing lifecycle.
Do not claim that uncommitted editor text is already autosaved or broadcast.
A continuous live-text persistence redesign is outside this proposal.

Shape direction commands use one store history entry.
Paragraph commands use one Tiptap history entry while editing.
Undo after the session ends follows existing whole-edit store semantics.
Derived decoration changes never add history entries.

Yjs transports the new fields without a format change.
Same-shape concurrent editing remains whole-object conflict resolution.
Do not claim character-level co-editing or lossless concurrent paragraph merges.
Retain this limitation explicitly in the final implementation report.

## 8. Interaction-state matrix

| Context | Control and target | Menu state |
|---|---|---|
| No eligible text shape selected | Unavailable through existing text-group eligibility | No direction state |
| One eligible shape selected | Set default and apply to all its paragraphs | Shape mode, plus override/mixed status |
| Several eligible shapes selected | One batch operation on eligible shapes | Common mode or Mixed |
| Text shapes plus image selected | Apply only to text shapes | State from eligible subset |
| Only image, connector, sticky, or table selected | No Paragraph control from TextGroup | No irrelevant metadata |
| Caret inside paragraph | Change that paragraph only | Stored/inherited mode and effective direction |
| Several paragraphs selected | Change all intersecting paragraphs | Common mode or Mixed |
| Caret inside numbered list | Change current paragraph, derive item's marker direction from first paragraph | Paragraph mode |
| Caret inside bulleted list | Same rule, preserve bullet style | Paragraph mode |
| Several paragraphs in one list item | Each selected paragraph changes, structure remains | Common mode or Mixed |
| Explicit RTL | Keep RTL regardless of first script | RTL selected |
| Explicit LTR | Keep LTR regardless of first script | LTR selected |
| Auto | First-strong resolution per paragraph | Auto selected, effective direction status |
| All Auto, different resolutions | No forced common direction | Auto selected, mixed effective directions |
| Editor exists but belongs to another store/target | Ignore it for this selection | Shape state or unavailable |
| Menu opened during editing | Preserve editing session and bookmark | Continue showing captured valid target |

## 9. File-by-file implementation plan

All paths below are relative to `frontend/src/`, except this document.
Mandatory changes form the approved implementation set. Inspection-only files need no speculative edit.

| File | Current responsibility | Required change and reason | Impact and compatibility |
|---|---|---|---|
| `diagram/textDirection.js` | LTR/RTL validation | Separate mode validation, inheritance, and first-strong resolution | Preserve existing validator callers with deliberate Auto updates |
| `diagram/unicodeBidiData.js` (new) | None | Pinned, attributed compact Unicode class ranges | No runtime package or network dependency |
| `diagram/richTextLists.js` | Flat list/text projection | Add structured blocks, modes, inline runs, list relationships, and direction-only normalization | Keep old exports and Markdown callers working |
| `diagram/textDirectionRendering.js` (new) | None | Render-only HTML direction projection and common list/layout policy | One resolution policy for editor, display, and export |
| `diagram/svgParagraphText.js` (new) | None | Focused SVG block/list text layout | Replace flattened marker/text coupling for affected shapes |
| `diagram/factories.js` | Shape defaults | Auto for newly created eligible text shapes | No loaded-document backfill, no image direction |
| `diagram/freeFloatingOps.js` | New migrated-role node creation | Opt new mind-map children into Auto where complete text blocks bypass defaults | Keep legacy node loads unchanged |
| `diagram/schema.js` | Document parse/version contract | Document optional direction fields and legacy fallback | No destructive migration or schema bump |
| `diagram/textMetrics.js` | Text measurement/wrapping | Reuse measured widths for directed/list run layout and gutter accounting | Keep existing exports and node sizing signatures |
| `composables/paragraphDirection.js` | Paragraph attributes/commands and list mirroring | Auto/inheritance support, text-block selection, derived list decorations, explicit history boundaries | Preserve marks, list structure, saved paragraph directions |
| `composables/useRichText.js` | Active editor, extensions, live commands | Session ownership, mode/effective readout, guarded commands, shared shape context input | Keep existing public formatting commands available |
| `composables/useTextDirection.js` (new) | None | Unified shape/paragraph command facade and mixed-state readout | No duplicated mutable document state |
| `composables/useTextFormatting.js` (new) | None | Owned menu focus scope and selection bookmark lifecycle | No timers, global blur suppression, or dependency edits |
| `composables/useBlockSelection.js` | Selection and editing derivations | Validate active editing ownership | Preserve eligible-subset selection behavior |
| `composables/useTextEditing.js` | Session and base text styling | New canvas text Auto default, direction-aware absent-alignment styling | Preserve existing explicit physical alignments |
| `composables/useThumbnail.js` | Document-to-SVG and thumbnail pipeline | Delegate affected text to shared SVG paragraph adapter | All existing export consumers keep their APIs |
| `stores/useDiagramStore.js` | History-tracked document mutations | One eligible-shape batch direction command with per-shape normalization and node fitting | Preserve content and unrelated fields, one undo entry |
| `utils/sanitizeHtml.js` | Safe rich HTML | Allow validated semantic Auto direction | Retain current security allowlists |
| `components/canvas/TextEditor.vue` | Editor lifecycle, commit, growth | Session-owned focus handling, direction context, teardown, shared styles | Retain commit-on-exit and keyboard list behavior |
| `components/canvas/ShapeView.vue` | Shape labels and rich display | Use resolved render-only HTML for direction-aware text and invalidate autofit | Keep untouched legacy fallback |
| `components/toolbar/groups/TextGroup.vue` | Text formatting UI | Adjacent stable Paragraph menu, facade commands, decoration fold, formatting focus scopes | No extra top-level width slot, separate Alignment |
| `components/toolbar/ParagraphDirectionMenu.vue` (new) | None | Focused three-mode menu, status, radio keyboard handling | Reuse frappe-ui Popover and ToolbarButton |
| `styles/richText.css` (new) | Styles currently inline in TextEditor | Shared direction/list gutters used by edit and display | Canvas content only, no application RTL |
| `design/paragraph-direction-v2.md` | This proposal | Record approved decisions, actual files, review findings, manual evidence, limitations | Preserve the previous document if it later becomes available |

Inspection-only paths: `useAutosave.js`, `useCollaboration.js`, `useClipboard.js`, `useExport.js`, `useAutoFitText.js`, `history.js`, `CanvasToolbar.vue`, `ToolbarButton.vue`, `shapeText.js`, and backend APIs.
Autofit direction invalidation is supplied through ShapeView's existing input getter.
Export, clipboard, autosave, and collaboration should inherit behavior without new protocols.

Optional improvements, excluded unless approved:

- A fourth “Use shape default” paragraph command to remove an individual override.
- Direction for connector labels, legacy framed nodes, sticky notes, and table cells.
- A continuous text-save pipeline or character-level Yjs collaboration.
- Additional numbering styles beyond the current editor schema.
- Updating stale automated tests. Do not edit or execute test files under the current manual-only policy.

The user prohibits running automated checks. This proposal also excludes writing test changes to keep the approved work manual-only.
If the user later wants test maintenance without execution, approve that separately.

If implementation proves a mandatory additional integration file, record the reason before broadening the change.
Do not use the file list as permission for unrelated refactoring.

## 10. Ordered implementation stages

No stage below is authorized until the user explicitly approves this proposal.

1. [ ] Establish optional modes, legacy fallback, new-shape defaults, and the shared Unicode resolver.
2. [ ] Add structured paragraph/list projection and direction-only normalization, preserving existing APIs.
3. [ ] Replace redundant list-item direction state with derived editor decorations.
4. [ ] Implement paragraph selection, mode commands, mixed readouts, and history boundaries.
5. [ ] Add the atomic shape batch command and unified direction facade.
6. [ ] Add session ownership, focus scopes, selection restoration, and lifecycle cleanup.
7. [ ] Add the stable dedicated Paragraph menu and approved toolbar width adjustment.
8. [ ] Apply shared HTML direction/list layout to editing and committed display.
9. [ ] Add SVG paragraph/list layout, marker isolation, wrapping, measurement, and autofit invalidation.
10. [ ] Review the complete source diff for compatibility, sanitization, selection, lists, and persistence.
11. [ ] Update this document with actual changes and remaining limits. Hand over the manual checklist.

The auto resolver precedes editor and renderer adapters because all consumers must share it.
Manual verification belongs to the user. Implementation completion does not imply manual acceptance.

## 11. Risks, mitigations, and alternatives

| Risk | Mitigation |
|---|---|
| Menu autofocus commits the editor | Keep a session-owned formatting focus scope, with explicit outside-exit and teardown paths |
| Keyboard navigation loses range or targets a new object | Capture a bookmark and session token, validate before command, restore only for the same session |
| Shape RTL appears ineffective because of old overrides | Primary shape command applies to all paragraphs and clears only direction overrides |
| Explicit Auto accidentally inherits shape RTL | Preserve null inheritance separately from explicit Auto |
| Auto flips on every keystroke | Resolve from the first strong character of the full paragraph, never the last typed script |
| Unicode detection mishandles newer or supplementary scripts | Pin official class data, include default ranges, iterate code points, document the version |
| Bidi control characters in paste change outer detection | Follow paragraph-level isolate rules without inserting controls |
| Existing centered/right alignment is overwritten | Never write alignment in direction commands, preserve stored physical values |
| List structure or marks are lost | Change attributes only, use Tiptap structural commands, preserve structured projections |
| Mixed-direction list gutters collide | Reserve symmetric gutters and derive marker side per item |
| Undo combines typing and direction unexpectedly | Use explicit ProseMirror history boundaries and one atomic shape store commit |
| Reopening rewrites old inherited direction intent | Keep old explicit paragraph values, normalize only on an intentional direction command |
| Derived direction pollutes persisted HTML | Use editor decorations and render-only projections, serialize stored modes |
| Direction affects wrapping but autofit does not rerun | Include direction/layout projection in ShapeView's existing watched inputs |
| Export lines disagree with HTML | Share resolution, geometry, font, gutter policy, and line height. Manually compare supported browsers and SVG viewers |
| Remote same-shape edits overwrite text | Disclose existing whole-shape conflict model. Do not claim a paragraph CRDT exists |
| Toolbar overflows at 1280px | Recover one trigger slot through the approved decoration fold. Manually verify densest states |
| Legacy documents change merely on opening | Missing fields retain legacy behavior. No eager metadata backfill |

Technical decision record:

1. Extend HTML plus optional shape metadata. A new persisted Tiptap JSON tree would duplicate the current source of truth.
2. Keep one first-strong resolver. Browser-only Auto cannot directly supply deterministic SVG paragraph layout and toolbar state.
3. Use generated Unicode class data. Script-range guessing fails international coverage and weak/neutral classification.
4. Derive list-item direction. Persisting both paragraph and item direction creates synchronization and inheritance ambiguity.
5. Apply shape commands to all paragraphs. Default-only behavior preserves overrides but can make the command appear ineffective.
6. Keep native HTML editing and pure SVG export. A complete new text layout engine or foreignObject-only export is broader and riskier.
7. Preserve current collaboration granularity. Character-level co-editing requires a separate document synchronization architecture.

## 12. Manual acceptance checklist

Run after implementation, in the user's safe local app.
Record browser, viewport, expected result, actual result, and failures.
No item below has been executed or passed during Phase 1.

### Control, selection, and focus

- [ ] Select an empty rectangle. Paragraph is beside Alignment without entering editing.
- [ ] Repeat for square, ellipse, text box, and another catalog shape.
- [ ] Enter and exit editing repeatedly. The Paragraph control remains available while the eligible shape stays selected.
- [ ] Open the popover and move the pointer between trigger and options. It remains usable.
- [ ] Open and navigate by keyboard. Escape closes it without deleting the selection or ending text editing.
- [ ] Select a text range, choose a mode, then type. Text replaces the intended selection.
- [ ] Select several paragraphs ending exactly at the next paragraph's boundary. The untouched paragraph keeps its mode.
- [ ] Select several text shapes plus an image. The command affects only eligible text shapes.
- [ ] Select only an image, connector, sticky, or table. No shared-shape Paragraph command appears.
- [ ] Navigate to another diagram and back. No stale editor or direction state remains.
- [ ] Check light/dark chrome and the densest selection at 1280px. No toolbar clipping or squashed controls occurs.

### Shape defaults and overrides

- [ ] Select an existing text rectangle, choose RTL, and confirm its paragraphs and list markers change.
- [ ] Reenter editing and add text. It follows the stored shape direction.
- [ ] Make one paragraph explicitly LTR inside the RTL shape. Other paragraphs remain RTL.
- [ ] Set the entire selected shape to RTL again. The LTR override clears as documented.
- [ ] Undo and redo the shape command. Default and paragraph overrides return together.
- [ ] Open a pre-feature document without direction metadata. Its untouched layout keeps legacy behavior.

### Automatic and explicit direction

- [ ] In a new Auto shape, type `سلام، این پروژه از Vue 3 استفاده می‌کند.`. Effective direction is RTL.
- [ ] Type `This project supports زبان فارسی.` in another Auto paragraph. Effective direction is LTR.
- [ ] Paste `123 - سلام دنیا` and `123 - Hello World` into separate Auto paragraphs. Resolve RTL and LTR respectively.
- [ ] Repeat with `مرحبا بالعالم`, `שלום עולם`, and `یہ ایک مثال ہے`. Each resolves RTL.
- [ ] Start with whitespace, emoji, punctuation, or Western digits. They do not choose direction before the first strong character.
- [ ] Enter only `123 - 😊`, then clear the paragraph. Both cases use the documented LTR fallback.
- [ ] Append English after Persian, then Persian after English. The first strong character keeps the base direction stable.
- [ ] Delete or replace the first strong character with the opposite script. Auto reevaluates.
- [ ] Choose explicit RTL for English-first text and explicit LTR for Persian-first text. Neither changes automatically.
- [ ] Change each back to Automatic. Content-based direction resumes.

### Mixed content, alignment, and formatting

- [ ] Edit `این پروژه با استفاده از Frappe Framework و Vue 3 توسعه یافته است.` in RTL.
- [ ] Edit `Frappe Draw supports متن فارسی inside an English paragraph.` in LTR.
- [ ] Compare `نسخه Vue 3، 50%، 2026/10/19، (test [12])، «سلام» 😊` during editing and after blur.
- [ ] Compare `ایمیل team@example.com و https://example.com/a?q=12` with surrounding punctuation.
- [ ] Combine bold, italic, underline, strikethrough, and color. Direction changes preserve every supported mark.
- [ ] Test RTL + Center, RTL + Right, RTL + Left, and LTR + Right. Direction changes preserve alignment.
- [ ] Press Enter after explicit and Auto paragraphs. New paragraphs follow the documented inheritance rule.
- [ ] Copy/paste rich text and plain text. Confirm explicit imported modes and destination inheritance respectively.

### Lists

- [ ] Create LTR numbered and bulleted lists. Existing marker placement remains on the left.
- [ ] Create RTL numbered and bulleted lists. Markers appear on the right, with readable punctuation and spacing.
- [ ] Choose direction before creating a list, then after creating one. Both produce the same layout.
- [ ] Create nested lists with Tab and Shift+Tab. RTL depth progresses from the right.
- [ ] Mix LTR and RTL siblings without splitting numbering or moving markers into adjacent text.
- [ ] Create several paragraphs within one list item. The marker follows its first paragraph only.
- [ ] Check wrapped continuation lines. They align with the content rather than beneath the marker.
- [ ] Use Enter, Backspace, list exit, indent, outdent, and list toggles. Structure and paragraph modes remain correct.
- [ ] Change direction across several selected list items. Marks, numbering starts, and hierarchy survive.
- [ ] Undo and redo direction, then list structural edits. The document returns to the expected states.

### Lifecycle and output

- [ ] Exit editing, wait for Saved, reload, and reopen editing. Modes and visible direction match.
- [ ] Duplicate and internally copy/paste a directed shape. Its defaults and overrides survive.
- [ ] Resize a wrapping shape and a fit-width text box. Auto sizing does not clip mixed-script text or markers.
- [ ] Repeat with migrated mind-map and flowchart shapes on a unified canvas.
- [ ] Export SVG, PNG, and PDF. Check markers, nested indent, punctuation, font marks, wrapping, and alignment.
- [ ] Check selection export, clipboard image, print, and saved thumbnail.
- [ ] Open SVG in the intended external viewer. Record font and bidi differences.
- [ ] In two sessions, edit different shapes and confirm direction metadata arrives after commit.
- [ ] Treat simultaneous same-shape edits as the documented conflict limitation, not a passing merge test.

## 13. As-built implementation and review status

The user approved Phase 2 with `continu`. Source implementation is complete for review. Manual app verification remains outstanding.

### Decisions applied and deviations

- `diagram/textDirection.js` resolves Auto using a temporary DOM element with `dir="auto"`, then caches the browser's resolved direction with a bounded cache. This uses the browser's Unicode bidi implementation rather than the proposed pinned Unicode range table. No text is rewritten. Browser support and the treatment of existing bidi controls remain unverified.
- New eligible shapes default to Auto; missing metadata in legacy shapes falls back to LTR. Paragraph `dir` mode overrides the shape default. Explicit paragraph Auto remains distinct from inherited null.
- The shape command sets the default and clears block/list `dir` attributes from the shape's rich HTML so a shape-level RTL/LTR command affects existing content. It preserves text, inline markup, lists, and alignment, and uses one store history commit.
- Paragraph selection updates paragraph, heading, and code-block attributes in one ProseMirror transaction. List marker direction is a derived editor decoration from the first paragraph of each list item.
- `useThumbnail.js` uses the existing flattened `richTextLines()` projection. SVG output isolates markers and applies direction-aware anchors, but does not preserve inline marks, empty paragraphs, or all multi-paragraph list structure. Nested lists are represented by depth-based indentation.
- Formatting menus register their edit-session scope. `TextEditor` listens for pointer and focus changes and commits after interaction leaves the editor and registered menus. It relies on ProseMirror's live selection; explicit selection bookmark restoration was not implemented.
- The dedicated Paragraph menu is adjacent to Alignment. Underline and Strikethrough now share a decoration popover to offset the additional toolbar trigger. Toolbar width and discoverability require manual review.
- Direction is stored in optional shape JSON and paragraph `dir` attributes. No schema change, migration, backend change, or new collaboration protocol was required. Same-shape collaboration remains whole-object conflict resolution.

### Actual changed files

- `design/paragraph-direction-v2.md`
- `frontend/src/components/canvas/ShapeView.vue`
- `frontend/src/components/canvas/TextEditor.vue`
- `frontend/src/components/toolbar/groups/TextGroup.vue`
- `frontend/src/components/toolbar/groups/ParagraphDirectionMenu.vue` (new)
- `frontend/src/composables/paragraphDirection.js`
- `frontend/src/composables/useBlockSelection.js`
- `frontend/src/composables/useClipboard.js`
- `frontend/src/composables/useRichText.js`
- `frontend/src/composables/useTextDirection.js` (new)
- `frontend/src/composables/useTextEditing.js`
- `frontend/src/composables/useTextFormatting.js` (new)
- `frontend/src/composables/useThumbnail.js`
- `frontend/src/diagram/factories.js`
- `frontend/src/diagram/richTextLists.js`
- `frontend/src/diagram/textDirection.js`
- `frontend/src/stores/useDiagramStore.js`
- `frontend/src/utils/sanitizeHtml.js`

The file-by-file proposal above records alternatives considered. Some proposed standalone files were not needed and were not created. The Phase 2 implementation added no new direction test file. Existing tests were later updated to check runtime list decorations and SVG text rendering.

### Source review and checks

Source review traced direction from the toolbar to the shape store or ProseMirror command, then to editor decorations, committed canvas rendering, and the existing SVG export pipeline. Direction commands do not patch alignment. Shape and paragraph direction are optional metadata, so old documents retain a defined fallback. This is source review only; no browser behavior has been proven.

Per the user's testing policy, no unit, E2E, integration, lint, formatting, build, bench, or live-browser checks were run. No commit or push was made. The active branch is `Rtl-Paragraph`.

### Manual acceptance checklist

- [ ] Select a rectangle, text box, and another supported text shape without entering editing. Choose RTL and LTR and confirm existing text responds. Check a multi-shape selection with an image included.
- [ ] In Auto, try Persian `سلام، این پروژه از Vue 3 استفاده می‌کند.`, Arabic, Hebrew, English `This project supports زبان فارسی.`, `123 - سلام دنیا`, and `123 - Hello World`.
- [ ] Check mixed abbreviations, percentages, dates, punctuation, nested parentheses, quotes, URLs, email addresses, emoji, and empty/neutral-only paragraphs.
- [ ] Explicitly choose LTR for Persian and RTL for English, continue typing, and confirm the chosen mode persists. Return to Auto and confirm automatic resolution resumes.
- [ ] Change direction at a caret in one paragraph, then with a multi-paragraph selection. Confirm unaffected paragraphs retain their modes and mixed state is shown.
- [ ] Open the menu while editing; move pointer and keyboard focus through the trigger, menu, editor, and canvas. Confirm the edit session and selection remain usable and canvas exit commits.
- [ ] Create LTR and RTL numbered/bulleted lists, including nested lists. Change direction before and after list creation. Check marker side, spacing, indent, wrapping, numbering, marks, Enter, Backspace, Tab, and Shift+Tab.
- [ ] Verify center, left, and right alignment with both directions. Direction changes must retain alignment and existing font marks.
- [ ] Undo and redo paragraph and shape direction changes.
- [ ] Copy, paste, and duplicate directed content. Save and reload new Auto shapes and legacy documents without metadata.
- [ ] Inspect canvas, SVG, PNG, PDF, print, selection export, and thumbnail. Check visual parity and record any wrapping or font differences.
- [ ] Check toolbar fit, accessible labels, keyboard navigation, focus indicator, and light/dark mode.
- [ ] If collaboration is enabled, verify committed direction arrives in another session and note the existing same-shape conflict behavior.

Known limitations: export is a flattened line projection that loses some rich structure and inline marks; Auto depends on browser `dir="auto"`; toolbar focus, SVG geometry, and visual output have not been manually verified; same-shape concurrent edits retain whole-object conflict behavior.

## 14. Current toggle behavior

The toolbar now shows two independent buttons: Right-to-Left (RTL) and Left-to-Right (LTR). It does not show an Automatic button. The two buttons are mutually exclusive because both read one mode value. When neither is active, the current paragraph or selected shape uses Auto.

Auto is represented by missing direction metadata where inheritance is available. New shapes do not store a redundant `direction: "auto"` value. A paragraph stores `dir="auto"` only when it must override a manually directed shape.

This update supersedes the earlier proposal text above that said legacy shapes without direction metadata use LTR. Missing shape direction now means Auto for new and existing shapes. It also supersedes the earlier recommendation to persist Auto on every new shape.

Clicking an inactive direction selects it. Clicking the active direction clears it. In a selected shape, clearing removes the shape direction field and clears rich-text block direction attributes. In paragraph editing, clearing removes the paragraph override when the shape has no manual direction. When the shape has manual LTR or RTL, clearing stores paragraph `dir="auto"` so the paragraph resolves from its own content.

| Paragraph mode | Shape mode | Effective paragraph direction |
|---|---|---|
| Explicit LTR or RTL | Any | Paragraph setting |
| Auto, explicit | Manual LTR or RTL | First strong character, with LTR fallback for neutral-only text |
| Inherited or absent | Manual LTR or RTL | Shape setting |
| Auto or absent | Auto or absent | First strong character, with LTR fallback for neutral-only text |

The effective direction shown in the menu status does not select a toggle. Only an explicit LTR or RTL override selects a toggle. A paragraph that inherits shape direction therefore shows neither selected and reports the inherited effective direction.

Shape direction remains a whole-shape action. It applies to all existing paragraphs by clearing their direction overrides. Paragraph direction remains a paragraph action and leaves other paragraphs unchanged. This action model makes the shape command visible even when old paragraph overrides exist.

The font selector now includes bundled Vazirmatn. Its selection is stored in the existing `text.style.font` field and applies to canvas text only. See [Canvas typography](canvas-typography.md) for font loading, fallback, and export behavior.

The typography update also changed `design/canvas-typography.md`, `design/README.md`, `design/SPEC.md`, `design/CONVENTIONS.md`, `frontend/src/diagram/textFonts.js`, `frontend/src/index.css`, `frontend/src/components/toolbar/textGroup.test.js`, `frontend/src/components/canvas/TextEditor.vue`, `frontend/src/components/canvas/ShapeView.vue`, `frontend/src/diagram/factories.js`, `frontend/src/diagram/richTextLists.js`, `frontend/src/composables/paragraphDirection.js`, `frontend/src/composables/useRichText.js`, `frontend/src/composables/useTextDirection.js`, `frontend/src/composables/useAutoFitText.js`, `frontend/src/composables/useClipboard.js`, `frontend/src/composables/useThumbnail.js`, and `frontend/src/stores/useDiagramStore.js`. The font and license assets are in `frontend/src/assets/fonts/`.

The frontend test suite passed: 155 files and 1,843 tests. The production build passed in the earlier verification, before the latest markdown escaping fix, and was not rerun afterward. Lint and browser checks were not run. Manual application verification remains outstanding.
