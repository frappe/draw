// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import {
	RICH_EXTENSIONS,
	clearActiveEditor,
	isMarkActive,
	richCommands,
	selectRichTextDocument,
	setActiveEditor,
} from "@/composables/useRichText.js";

let editor;

function createEditor(content = "<p></p>") {
	editor = new Editor({
		element: document.createElement("div"),
		extensions: RICH_EXTENSIONS,
		content,
	});
	return editor;
}

function typeText(text) {
	const { from, to } = editor.state.selection;
	let handled = false;
	editor.view.someProp("handleTextInput", (handler) => {
		handled = handler(editor.view, from, to, text) || handled;
		return handled;
	});
	return handled;
}

function pressKey(key) {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	let handled = false;
	editor.view.someProp("handleKeyDown", (handler) => {
		handled = handler(editor.view, event) || handled;
		return handled;
	});
	return handled;
}

function paragraphPosition(text) {
	let position = null;
	editor.state.doc.descendants((node, offset) => {
		if (node.type.name === "paragraph" && node.textContent === text) position = offset + 1;
	});
	return position;
}

function emptyParagraphPosition() {
	let position = null;
	editor.state.doc.descendants((node, offset) => {
		if (node.type.name === "paragraph" && !node.textContent) position = offset + 1;
	});
	return position;
}

function selectDocumentText() {
	return selectRichTextDocument(editor);
}

afterEach(() => {
	if (editor) clearActiveEditor(editor);
	editor?.destroy();
});

describe("TipTap list behavior from the locked StarterKit configuration", () => {
	it("converts a typed decimal marker and removes the marker text", () => {
		createEditor();

		expect(typeText("1. ")).toBe(true);
		editor.commands.insertContent("First task");

		expect(editor.getHTML()).toContain("<ol>");
		expect(editor.getHTML()).toContain("<li><p>First task</p></li>");
		expect(editor.getText().trim()).toBe("First task");
	});

	it("converts a typed hyphen marker into a bullet list", () => {
		createEditor();

		expect(typeText("- ")).toBe(true);
		editor.commands.insertContent("First task");

		expect(editor.getHTML()).toContain("<ul>");
		expect(editor.getText().trim()).toBe("First task");
	});

	it("continues a numbered list and exits after Enter on an empty item", () => {
		createEditor();
		expect(typeText("1. ")).toBe(true);
		editor.commands.insertContent("First");

		expect(pressKey("Enter")).toBe(true);
		editor.commands.insertContent("Second");
		expect(editor.getHTML()).toContain("<li><p>Second</p></li>");

		expect(pressKey("Enter")).toBe(true);
		expect(pressKey("Enter")).toBe(true);
		expect(editor.getHTML()).toContain("</ol><p></p>");
	});

	it("starts a new numbered list at one after exiting the previous list", () => {
		createEditor();
		expect(typeText("1. ")).toBe(true);
		editor.commands.insertContent("First");
		pressKey("Enter");
		pressKey("Enter");

		expect(typeText("1. ")).toBe(true);
		editor.commands.insertContent("New list");

		expect(editor.getHTML().match(/<ol>/g)).toHaveLength(2);
		expect(editor.getHTML()).not.toContain('start="2"');
	});

	it("undoes and redoes automatic list conversion", () => {
		createEditor();
		expect(typeText("1. ")).toBe(true);
		expect(editor.getHTML()).toContain("<ol>");

		expect(editor.commands.undo()).toBe(true);
		expect(editor.getHTML()).not.toContain("<ol>");
		expect(editor.commands.redo()).toBe(true);
		expect(editor.getHTML()).toContain("<ol>");
	});

	it("does not turn a marker typed after existing paragraph text into a list", () => {
		createEditor("<p>Existing text</p>");
		editor.commands.setTextSelection(editor.state.doc.content.size - 1);

		expect(typeText("1. ")).toBe(false);
		expect(editor.getHTML()).toBe("<p>Existing text</p>");
	});

	it("does not convert a marker inside a code block", () => {
		createEditor("<pre><code></code></pre>");
		editor.commands.setTextSelection(2);

		expect(typeText("- ")).toBe(false);
		expect(editor.getHTML()).toContain("<pre><code></code></pre>");
	});

	it("converts selected paragraphs and keeps inline marks and links", () => {
		createEditor(
			"<p><strong>First task</strong></p>" +
				'<p><a href="https://example.com">Second task</a></p>'
		);
		editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });

		expect(editor.commands.toggleOrderedList()).toBe(true);
		const html = editor.getHTML();
		expect(html).toContain("<ol>");
		expect(html).toContain("<strong>First task</strong>");
		expect(html).toMatch(/<a[^>]*href="https:\/\/example\.com"[^>]*>Second task<\/a>/);
	});

	it("formats whole boundary paragraphs from a partial selection only", () => {
		createEditor("<p>before First after</p><p>Second after</p><p>Outside</p>");
		const first = paragraphPosition("before First after");
		const second = paragraphPosition("Second after");
		editor.commands.setTextSelection({
			from: first + "before ".length,
			to: second + "Second".length,
		});

		editor.commands.toggleBulletList();

		const html = editor.getHTML();
		expect(html).toContain("<li><p>before First after</p></li>");
		expect(html).toContain("<li><p>Second after</p></li>");
		expect(html).toContain("<p>Outside</p>");
	});

	it("converts a bullet list to a numbered list without losing its text", () => {
		createEditor("<ul><li><p>First</p></li><li><p>Second</p></li></ul>");
		editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });

		editor.commands.toggleOrderedList();

		expect(editor.getHTML()).toContain("<ol>");
		expect(editor.getHTML()).toContain("First");
		expect(editor.getHTML()).toContain("Second");
		expect(editor.getHTML()).not.toContain("<ul>");
	});

	it("toggles a list off and supports undo and redo", () => {
		createEditor("<ul><li><p>Keep</p></li></ul>");
		editor.commands.setTextSelection(paragraphPosition("Keep"));

		expect(editor.commands.toggleBulletList()).toBe(true);
		expect(editor.getHTML()).not.toContain("<ul>");
		expect(editor.commands.undo()).toBe(true);
		expect(editor.getHTML()).toContain("<ul>");
		expect(editor.commands.redo()).toBe(true);
		expect(editor.getHTML()).not.toContain("<ul>");
		expect(editor.getText().trim()).toBe("Keep");
	});

	it.each(["bulletList", "orderedList"])(
		"toggles a whole-shape %s off and on without adding empty items",
		(listType) => {
			const tag = listType === "bulletList" ? "ul" : "ol";
			createEditor(`<${tag}><li><p>First</p></li><li><p>Second</p></li></${tag}>`);
			setActiveEditor(editor);

			for (let click = 0; click < 4; click += 1) {
				selectDocumentText();
				expect(richCommands.toggleList(listType, { focus: false })).toBe(true);
				const html = editor.getHTML();
				expect(html.includes(`<${tag}>`)).toBe(click % 2 === 1);
				expect(html).not.toContain("<li><p></p></li>");
				expect(editor.getText()).toContain("First");
				expect(editor.getText()).toContain("Second");
			}
		}
	);

	it("applies and removes a list across the whole text document", () => {
		createEditor("<p>First</p><p>Second</p>");
		setActiveEditor(editor);
		selectDocumentText();

		expect(richCommands.toggleList("orderedList", { focus: false })).toBe(true);
		expect(editor.getHTML().match(/<li>/g)).toHaveLength(2);
		expect(editor.getHTML()).not.toContain("<li><p></p></li>");

		selectDocumentText();
		expect(richCommands.toggleList("orderedList", { focus: false })).toBe(true);
		expect(editor.getHTML()).not.toContain("<ol>");
		expect(editor.getHTML()).toContain("<p>First</p>");
		expect(editor.getHTML()).toContain("<p>Second</p>");
	});

	it("removes empty list items left by repeated whole-shape clicks", () => {
		createEditor(
			"<ol><li><p>First</p></li><li><p>Second</p></li><li><p></p></li></ol><p></p>"
		);
		setActiveEditor(editor);
		selectDocumentText();

		expect(richCommands.toggleList("orderedList", { focus: false })).toBe(true);
		expect(editor.getHTML()).not.toContain("<ol>");
		expect(editor.getHTML()).not.toContain("<li>");
		expect(editor.getHTML()).toContain("<p>First</p>");
		expect(editor.getHTML()).toContain("<p>Second</p>");
	});

	it("preserves a selected paragraph range through toolbar apply, conversion, and toggle", () => {
		createEditor(
			"<p><strong><em><u>First task</u></em></strong></p>" +
				'<p><a href="https://example.com"><em>Second task</em></a></p>' +
				"<p>Outside</p>"
		);
		const first = paragraphPosition("First task");
		const second = paragraphPosition("Second task");
		editor.commands.setTextSelection({
			from: first,
			to: second + "Second".length,
		});
		setActiveEditor(editor);

		expect(richCommands.toggleBulletList()).toBe(true);
		expect(isMarkActive("bulletList")).toBe(true);
		expect(editor.getHTML()).toContain(
			"<ul><li><p><strong><em><u>First task</u></em></strong></p></li>"
		);
		expect(editor.getHTML()).toContain(
			'<li><p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com"><em>Second task</em></a></p></li></ul>'
		);
		expect(editor.getHTML()).toContain("<p>Outside</p>");

		expect(richCommands.toggleOrderedList()).toBe(true);
		expect(isMarkActive("orderedList")).toBe(true);
		expect(editor.getHTML()).toContain("<ol>");
		expect(editor.getHTML()).not.toContain("<ul>");
		expect(editor.getHTML()).toContain("<p>Outside</p>");

		expect(richCommands.toggleOrderedList()).toBe(true);
		expect(isMarkActive("orderedList")).toBe(false);
		expect(editor.getHTML()).not.toContain("<ol>");
		expect(editor.getHTML()).toContain("<strong><em><u>First task</u></em></strong>");
		expect(editor.getHTML()).toContain(
			'<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com"><em>Second task</em></a>'
		);
		expect(editor.getHTML()).toContain("<p>Outside</p>");

		clearActiveEditor(editor);
		expect(isMarkActive("bulletList")).toBe(false);
	});

	it("does not delete an earlier item when Backspace is pressed in an empty item", () => {
		createEditor("<ul><li><p>Keep</p></li><li><p></p></li></ul>");
		editor.commands.setTextSelection(emptyParagraphPosition());

		pressKey("Backspace");

		expect(editor.getText()).toContain("Keep");
	});
});
