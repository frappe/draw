import { afterEach, describe, it, expect, vi } from "vitest";
import { wrapLineCount, charsPerLine, wrapTextToWidth } from "./textMetrics.js";

afterEach(() => vi.unstubAllGlobals());

// These back mind-map AND flowchart node sizing, which used to carry their own
// copy of the algorithm. The long-word branch is the subtle one: a word wider
// than the box has to break across lines, and it must not lose the line it was
// already partway through.
describe("wrapLineCount", () => {
	it("counts a single line that fits", () => {
		expect(wrapLineCount("hello world", 20)).toBe(1);
	});

	it("returns 1 for empty or whitespace-only text", () => {
		expect(wrapLineCount("", 10)).toBe(1);
		expect(wrapLineCount("   ", 10)).toBe(1);
	});

	it("packs whole words and wraps when the next word will not fit", () => {
		// "aaa bbb" = 7 chars with the space; at 7 per line it fits, at 6 it wraps.
		expect(wrapLineCount("aaa bbb", 7)).toBe(1);
		expect(wrapLineCount("aaa bbb", 6)).toBe(2);
	});

	it("breaks a word longer than the line across lines", () => {
		expect(wrapLineCount("aaaaaaaaa", 3)).toBe(3);
	});

	it("finishes the current line before breaking a long word", () => {
		// 'ab' occupies line 1, then the 9-char word starts a new line and needs 3.
		expect(wrapLineCount("ab aaaaaaaaa", 3)).toBe(4);
	});

	it("coerces non-string input rather than throwing", () => {
		expect(wrapLineCount(42, 10)).toBe(1);
		expect(wrapLineCount(null, 10)).toBe(1);
	});
});

describe("charsPerLine", () => {
	it("divides the box width by the character width", () => {
		expect(charsPerLine(100, 10)).toBe(10);
		expect(charsPerLine(95, 10)).toBe(9); // floors — a partial column cannot hold a char
	});

	it("never returns less than one column", () => {
		expect(charsPerLine(4, 10)).toBe(1);
		expect(charsPerLine(0, 10)).toBe(1);
	});

	// #509: callers multiply a character count by charWidth to get a box, then come
	// back here to divide it out again. A fractional charWidth used to lose a
	// character to floating point, which grew the node a line and then took it back.
	it("recovers the character count a width was multiplied from", () => {
		for (const charWidth of [8.5, 8.5 * (16 / 14), 8.5 * (17 / 14), 6.4, 6.4 * (14 / 12)]) {
			for (let chars = 1; chars <= 80; chars += 1) {
				expect(charsPerLine(chars * charWidth, charWidth)).toBe(chars);
			}
		}
	});

	it("still floors a width that genuinely falls short of a column", () => {
		const charWidth = 8.5 * (16 / 14);
		expect(charsPerLine(15 * charWidth - 0.5, charWidth)).toBe(14);
	});
});

describe("wrapTextToWidth", () => {
	it("uses selected font metrics, keeps hard breaks, and breaks at grapheme boundaries", () => {
		let unitWidth = 2;
		const context = {
			font: "",
			measureText: (text) => ({ width: Array.from(text).length * unitWidth }),
		};
		vi.stubGlobal("document", {
			createElement: () => ({ getContext: () => context }),
		});

		expect(
			wrapTextToWidth("iiiiiiiiii", 10, {
				size: 10,
				font: "'Vazirmatn', sans-serif",
				bold: true,
			})
		).toEqual(["iiiii", "iiiii"]);
		expect(context.font).toContain("'Vazirmatn', sans-serif");
		expect(context.font).toContain("700");

		unitWidth = 1;
		expect(wrapTextToWidth("abcdef\nxy", 2, { size: 12 })).toEqual(["ab", "cd", "ef", "xy"]);
	});
});
