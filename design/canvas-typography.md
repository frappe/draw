# Canvas typography

This document records the canvas font choices and their rendering behavior. The application interface keeps the Espresso Inter stack. Shape text uses the separate canvas font registry.

## Font registry

`frontend/src/diagram/textFonts.js` is the shared registry for shape text controls. The selected family is stored in `shape.text.style.font`. Existing shapes without that field continue to use Inter.

The registry includes Inter, Vazirmatn, Serif, Mono, and Handwritten. Vazirmatn is bundled as a variable WOFF2 from the official v33.003 release. Its SIL Open Font License is stored beside the font at `frontend/src/assets/fonts/OFL.txt`. The variable face supports weights 100 through 900.

`frontend/src/index.css` declares the local face. The browser uses the Inter stack while the font loads and when it cannot load. The font choice applies to canvas shape text, not toolbar labels or other application chrome.

## Rendering and measurement

`TextGroup.vue` writes the selected family into the existing shape style field. `TextEditor.vue` and `ShapeView.vue` use that field through the shared text style. `textMetrics.js` measures text with the selected family. The editor waits for the selected face before growing text, and `useAutoFitText.js` waits before shrinking committed text to fit.

The fallback keeps text visible when a font is unavailable. A font change can alter line breaks and fitted size because each face has different glyph widths. No saved text or marks change when the family changes.

## Export

`useThumbnail.js` uses the stored font family in its SVG text. When a document uses Vazirmatn, `documentToSvg()` embeds the bundled WOFF2 data in an SVG `@font-face` rule. SVG, PNG, JPEG, and print paths that use this renderer can then use the same face. PDF export rasterizes the SVG through the existing PNG path.

Other fonts remain system-font stacks and may render differently on a machine that lacks them. SVG consumers must support embedded WOFF2 fonts for the embedded face to apply. Export remains browser-rendered; no server font installation is needed.

## Direction controls

Paragraph direction is separate from font choice and text alignment. The toolbar has two independent direction toggles. RTL and LTR are explicit modes. When neither toggle is active, the paragraph uses Auto.

For a paragraph, an explicit LTR or RTL setting wins. If the shape has a manual direction, a paragraph in Auto mode resolves from its content and overrides that shape default. Without a manual shape direction, an unset paragraph resolves from its content. Neutral-only content falls back to LTR. See [Paragraph direction](paragraph-direction-v2.md) for the full model and transitions.

## Source and license

- Font source: [Vazirmatn v33.003](https://github.com/rastikerdar/vazirmatn/releases/tag/v33.003)
- License: SIL Open Font License 1.1, included at `frontend/src/assets/fonts/OFL.txt`
- Local face: `frontend/src/assets/fonts/Vazirmatn-Variable.woff2`

## Review status

- [x] Register Vazirmatn and bundle its variable font and license.
- [x] Keep UI typography unchanged.
- [x] Use the stored canvas font for editing, rendering, measurement, and SVG export.
- [x] Document direction toggle and inheritance behavior.
- [ ] Verify the font and direction behavior manually in the application.

### Manual check

- [ ] Select Vazirmatn on a shape, then type Persian, Arabic, and Latin text.
- [ ] Compare the active editor, committed shape, and reopened shape.
- [ ] Check bold text and a font-size change at several sizes.
- [ ] Resize a wrapping shape and a fit-width text box. Check line breaks and clipping.
- [ ] Export SVG, PNG, JPEG, and PDF. Check the glyph shapes and line wrapping.
- [ ] Open the SVG in the target external viewer and confirm its embedded font support.
- [ ] Switch back to Inter and confirm other shapes and application chrome stay unchanged.

The frontend test suite passed: 155 files and 1,843 tests. The production build passed in the earlier verification, before the latest markdown escaping fix, and was not rerun afterward. Lint and browser checks were not run. Manual verification remains outstanding.
