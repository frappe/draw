// Espresso defines the UI sans and mono stacks. Canvas shapes also offer
// Vazirmatn, which is bundled for consistent Persian and Arabic rendering.
//
// Inter used to be `value: ''`, which inherited whatever the canvas happened to be
// set in rather than naming a stack. Mono was Espresso's list minus 'JetBrains Mono'.
//
// Serif and Handwritten have no Espresso equivalent and stay as canvas-only extras.
// CLAUDE.md cardinal rule 2 keeps the canvas separate from the application chrome.
//
// "Rounded" is gone. Its stack asked for Nunito, which was never loaded anywhere in
// the app — no @font-face, no import — so it fell back to Segoe UI on Windows and
// plain system-ui on macOS and had never once rendered as anything rounded. An
// option that does nothing is worse than one fewer option, and shipping a webfont to
// rescue it was not worth the download.
export const ESPRESSO_SANS =
	"'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const ESPRESSO_MONO = "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace";
export const VAZIRMATN = "'Vazirmatn', 'Inter', sans-serif";

export const FONTS = [
	{ label: "Inter", value: ESPRESSO_SANS },
	{ label: "Vazirmatn", value: VAZIRMATN },
	{ label: "Serif", value: 'Georgia, "Times New Roman", serif' },
	{ label: "Mono", value: ESPRESSO_MONO },
	{
		label: "Handwritten",
		value: "'Bradley Hand', 'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', cursive",
	},
];
