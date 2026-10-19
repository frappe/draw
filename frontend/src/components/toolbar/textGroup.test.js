import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ESPRESSO_SANS, ESPRESSO_MONO, VAZIRMATN, FONTS } from "../../diagram/textFonts.js";

// The canvas font menu includes Espresso stacks and canvas-only faces. Import the
// shared list directly so the browser-free test checks the actual values.
const here = path.dirname(fileURLToPath(import.meta.url));
const groupSource = readFileSync(path.join(here, "groups/TextGroup.vue"), "utf8");
// design/colors_and_type.css lines 190-192. Restated here so a drift in either
// direction fails: Espresso's stack is the contract, not whatever TextGroup holds.
const EXPECTED_ESPRESSO_SANS =
	"'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif";
const EXPECTED_ESPRESSO_MONO = "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace";

describe("the canvas font menu (#475)", () => {
	it("matches Espresso exactly on the two typefaces Espresso defines", () => {
		expect(ESPRESSO_SANS).toBe(EXPECTED_ESPRESSO_SANS);
		expect(ESPRESSO_MONO).toBe(EXPECTED_ESPRESSO_MONO);
		expect(FONTS.find(({ label }) => label === "Inter")?.value).toBe(ESPRESSO_SANS);
		expect(FONTS.find(({ label }) => label === "Mono")?.value).toBe(ESPRESSO_MONO);
	});

	describe("list controls use the active shared editor", () => {
		it("renders separate list toggles directly with the existing formatting buttons", () => {
			expect(groupSource).toContain('label="Bulleted list"');
			expect(groupSource).toContain('label="Numbered list"');
			expect(groupSource).toContain(":active=\"listActive('bulletList')\"");
			expect(groupSource).toContain(":active=\"listActive('orderedList')\"");
			expect(groupSource).toContain(':disabled="!editing && !canFormatSelectedShapeAsList"');
			expect(groupSource).toContain("@click=\"toggleList('bulletList')\"");
			expect(groupSource).toContain("@click=\"toggleList('orderedList')\"");
			expect(groupSource).toContain(
				"store.state.selection.length === 1 && textShapes.value.length === 1"
			);
			expect(groupSource).toContain("textEditing.beginTextEditForList(shape.id, name)");
			expect(groupSource).not.toContain('<Popover v-if="editing">');
		});
	});

	// Inter was `value: ''`, so a shape inherited whatever the canvas happened to be
	// set in rather than naming the stack it claims to use.
	it("names Inter a real stack instead of inheriting one", () => {
		expect(FONTS.find(({ label }) => label === "Inter")?.value).not.toBe("");
	});

	// Espresso's mono list is the same as the one Draw had, plus JetBrains Mono in
	// second place. That one entry was the whole difference.
	it("keeps JetBrains Mono in the mono stack", () => {
		expect(ESPRESSO_MONO).toContain("'JetBrains Mono'");
	});

	// Nunito was never loaded anywhere in the app — no @font-face, no import — so
	// "Rounded" fell back to Segoe UI or system-ui and had never rendered as anything
	// rounded. An option that does nothing is worse than one fewer option.
	// Bound to the list, not the file: the comment above it records why Rounded went,
	// and naming the option it removed must not fail the check that it is gone.
	it("drops Rounded, which never had a font to render with", () => {
		expect(FONTS.some(({ label }) => label === "Rounded")).toBe(false);
		expect(FONTS).toHaveLength(5);
	});

	// The canvas is the explicit exception to chrome tokens (cardinal rule 2), so the
	// two faces Espresso has no opinion on stay as canvas-only extras.
	it("keeps the faces Espresso does not define", () => {
		expect(FONTS.some(({ label }) => label === "Serif")).toBe(true);
		expect(FONTS.some(({ label }) => label === "Handwritten")).toBe(true);
	});

	it("offers the bundled Vazirmatn canvas font", () => {
		expect(VAZIRMATN).toBe("'Vazirmatn', 'Inter', sans-serif");
		expect(FONTS.find(({ label }) => label === "Vazirmatn")?.value).toBe(VAZIRMATN);
	});

	// With Inter naming a stack, an unset font no longer matches any option. Left as
	// '', the Select would render blank on every shape that has never had a font
	// picked — which is most of them.
	it("resolves an unset font to Inter so the Select still shows a value", () => {
		expect(groupSource).toContain("textStyle.value.font || ESPRESSO_SANS");
	});

	// #556: table cells need the same stacks, so they moved to a shared module
	// rather than a second copy living in TextGroup itself.
	it("imports the font list from the shared module instead of holding its own copy", () => {
		expect(groupSource).toContain('from "@/diagram/textFonts.js"');
		expect(groupSource).not.toContain("const FONTS = [");
	});
});
