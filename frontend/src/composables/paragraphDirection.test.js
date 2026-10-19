// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import {
	RICH_EXTENSIONS,
	clearActiveEditor,
	richCommands,
	setActiveEditor,
	currentParagraphDirection,
} from "./useRichText.js";
import { sanitizeRichText } from "@/utils/sanitizeHtml.js";

let editor;

function open(html) {
	editor = new Editor({
		element: document.createElement("div"),
		extensions: RICH_EXTENSIONS,
		content: html,
	});
	setActiveEditor(editor);
	return editor;
}

function paragraph(text) {
	let result;
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name === "paragraph" && node.textContent === text) result = { node, pos };
	});
	return result;
}

function listItem(text) {
	let result;
	editor.state.doc.descendants((node) => {
		if (node.type.name === "listItem" && node.textContent === text) result = node;
	});
	return result;
}

function renderedListItem(text) {
	return [...editor.view.dom.querySelectorAll("li")].find(
		(item) => item.textContent.trim() === text
	);
}

afterEach(() => {
	if (editor) clearActiveEditor(editor);
	editor?.destroy();
});

describe("paragraph direction", () => {
	it("changes only the caret paragraph and retains alignment and marks", () => {
		open(
			'<p>English</p><p style="text-align: left"><strong>فارسی Frappe 3</strong></p><p>Arabic عربي</p>'
		);
		editor.commands.setTextSelection(paragraph("فارسی Frappe 3").pos + 1);
		expect(richCommands.setDirection("rtl")).toBe(true);
		expect(currentParagraphDirection()).toBe("rtl");
		expect(paragraph("English").node.attrs.dir).toBeNull();
		expect(paragraph("Arabic عربي").node.attrs.dir).toBeNull();
		expect(editor.getHTML()).toContain('dir="rtl"');
		expect(editor.getHTML()).toContain("text-align: left");
		expect(editor.getHTML()).toContain("<strong>فارسی Frappe 3</strong>");
	});

	it("changes a multi-paragraph selection and leaves other paragraphs alone", () => {
		open("<p>One</p><p>دو 25%</p><p>ثلاثة 2026/10/19</p><p>Four</p>");
		editor.commands.setTextSelection({
			from: paragraph("دو 25%").pos + 1,
			to: paragraph("ثلاثة 2026/10/19").pos + 4,
		});
		const selection = { from: editor.state.selection.from, to: editor.state.selection.to };
		expect(richCommands.setDirection("rtl")).toBe(true);
		expect(editor.state.selection.from).toBe(selection.from);
		expect(editor.state.selection.to).toBe(selection.to);
		expect(paragraph("One").node.attrs.dir).toBeNull();
		expect(paragraph("دو 25%").node.attrs.dir).toBe("rtl");
		expect(paragraph("ثلاثة 2026/10/19").node.attrs.dir).toBe("rtl");
		expect(paragraph("Four").node.attrs.dir).toBeNull();
	});

	it("round trips mixed scripts, URLs, punctuation and explicit directions", () => {
		const text = "ایمیل team@example.com (Frappe 3) 50% 😊";
		open(`<p dir="rtl">${text}</p><p dir="ltr">English (متن فارسی) https://example.com</p>`);
		const saved = editor.getHTML();
		expect(saved).toContain('dir="rtl"');
		expect(saved).toContain('dir="ltr"');
		editor.commands.setContent(saved);
		expect(paragraph(text).node.attrs.dir).toBe("rtl");
		expect(sanitizeRichText(saved)).toContain('dir="rtl"');
		expect(sanitizeRichText('<p dir="evil">safe</p>')).not.toContain("dir=");
		expect(sanitizeRichText('<p dir="RTL">safe</p>')).toContain('dir="rtl"');
	});

	it("reports mixed state and resolves old paragraphs from their content", () => {
		open('<p>Old English</p><p dir="rtl">عربي</p>');
		editor.commands.setTextSelection({
			from: paragraph("Old English").pos + 1,
			to: paragraph("عربي").pos + 2,
		});
		expect(currentParagraphDirection()).toBe("mixed");
		editor.commands.setTextSelection(paragraph("Old English").pos + 1);
		expect(currentParagraphDirection()).toBe("ltr");
	});

	it.each(["bulletList", "orderedList"])("keeps %s structure and marker direction", (type) => {
		open("<p><strong>مرحبا English 12.5%</strong></p>");
		editor.commands.setTextSelection(paragraph("مرحبا English 12.5%").pos + 2);
		expect(richCommands.setDirection("rtl")).toBe(true);
		expect(richCommands.toggleList(type)).toBe(true);
		expect(renderedListItem("مرحبا English 12.5%").getAttribute("dir")).toBe("rtl");
		expect(paragraph("مرحبا English 12.5%").node.attrs.dir).toBe("rtl");
		expect(editor.getHTML()).toContain("<strong>مرحبا English 12.5%</strong>");
		expect(editor.getHTML()).toContain(type === "bulletList" ? "<ul>" : "<ol>");
		expect(richCommands.setDirection("ltr")).toBe(true);
		expect(renderedListItem("مرحبا English 12.5%").getAttribute("dir")).toBe("ltr");
	});

	it("inherits on Enter and survives undo and redo", () => {
		open("<p>فارسی</p>");
		editor.commands.setTextSelection(paragraph("فارسی").pos + 6);
		richCommands.setDirection("rtl");
		editor.commands.splitBlock();
		const paragraphs = [];
		editor.state.doc.descendants((node) => {
			if (node.type.name === "paragraph") paragraphs.push(node);
		});
		expect(paragraphs.map((node) => node.attrs.dir)).toEqual(["rtl", "rtl"]);
		editor.commands.undo();
		expect(editor.getHTML()).toBe('<p dir="rtl">فارسی</p>');
		editor.commands.undo();
		expect(editor.getHTML()).toBe("<p>فارسی</p>");
		editor.commands.redo();
		expect(editor.getHTML()).toContain('dir="rtl"');
		editor.commands.redo();
		expect(editor.state.doc.childCount).toBe(2);
	});

	it("changes a nested list item without changing its parent", () => {
		open("<ul><li><p>Parent</p><ul><li><p>Nested</p></li></ul></li></ul>");
		editor.commands.setTextSelection(paragraph("Nested").pos + 1);
		richCommands.setDirection("rtl");
		expect(renderedListItem("Nested").getAttribute("dir")).toBe("rtl");
		expect(listItem("ParentNested").attrs.dir).toBeUndefined();
		expect(editor.getHTML()).toContain('<li><p dir="rtl">Nested</p></li>');
	});

	it("imports a list item direction into its paragraph", () => {
		open('<ul dir="rtl"><li><p>مرحبا</p></li></ul>');
		expect(paragraph("مرحبا").node.attrs.dir).toBe("rtl");
		expect(currentParagraphDirection()).toBe("rtl");
	});

	it("keeps direction through list Enter, indent, and outdent", () => {
		open(
			'<ol><li dir="rtl"><p dir="rtl">اول</p></li><li dir="rtl"><p dir="rtl">دوم</p></li></ol>'
		);
		editor.commands.setTextSelection(paragraph("دوم").pos + 1);
		expect(editor.commands.sinkListItem("listItem")).toBe(true);
		expect(paragraph("دوم").node.attrs.dir).toBe("rtl");
		expect(renderedListItem("دوم").getAttribute("dir")).toBe("rtl");
		expect(editor.commands.liftListItem("listItem")).toBe(true);
		expect(renderedListItem("دوم").getAttribute("dir")).toBe("rtl");
		editor.commands.setTextSelection(paragraph("دوم").pos + 4);
		expect(editor.commands.splitListItem("listItem")).toBe(true);
		const items = [];
		editor.state.doc.descendants((node) => {
			if (node.type.name === "listItem") items.push(node);
		});
		expect(renderedListItem(items.at(-1).textContent).getAttribute("dir")).toBe("rtl");
		expect(items.at(-1).firstChild.attrs.dir).toBe("rtl");
	});
});
