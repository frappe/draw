// Espresso defines exactly two typefaces (design/colors_and_type.css): the Inter
// sans stack and a mono stack. Those two now match it character for character (#475).
//
// Inter used to be `value: ''`, which inherited whatever the canvas happened to be
// set in rather than naming a stack. Mono was Espresso's list minus 'JetBrains Mono'.
//
// Serif and Handwritten have no Espresso equivalent and stay as canvas-only extras —
// CLAUDE.md cardinal rule 2 makes the SVG canvas the explicit exception to chrome
// tokens, so the canvas is allowed a look of its own.
//
// "Rounded" is gone. Its stack asked for Nunito, which was never loaded anywhere in
// the app — no @font-face, no import — so it fell back to Segoe UI on Windows and
// plain system-ui on macOS and had never once rendered as anything rounded. An
// option that does nothing is worse than one fewer option, and shipping a webfont to
// rescue it was not worth the download.
export const ESPRESSO_SANS = "'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
export const ESPRESSO_MONO = "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace"

export const FONTS = [
  { label: 'Inter', value: ESPRESSO_SANS },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: ESPRESSO_MONO },
  { label: 'Handwritten', value: "'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive" },
]
