// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isTextEditingSurfaceTarget } from "./useTextFormatting.js";

describe("text editing focus boundaries", () => {
	it("keeps focus in formatting controls even when no popover is open", () => {
		const toolbar = document.createElement("div");
		toolbar.setAttribute("data-text-formatting-surface", "");
		const input = document.createElement("input");
		toolbar.append(input);
		document.body.append(toolbar);

		expect(isTextEditingSurfaceTarget(input)).toBe(true);
		toolbar.remove();
	});

	it("keeps keyboard focus in the editor and commits on a real outside target", () => {
		const editor = document.createElement("div");
		editor.setAttribute("contenteditable", "true");
		const paragraph = document.createElement("p");
		editor.append(paragraph);
		const canvas = document.createElement("button");

		expect(isTextEditingSurfaceTarget(paragraph)).toBe(true);
		expect(isTextEditingSurfaceTarget(canvas)).toBe(false);
	});
});
