// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	markdownListLines,
	renderRichTextWithDefaultDirection,
	richTextLayoutWidth,
	richTextLayoutText,
	richTextLines,
} from "./richTextLists.js";
import { mindmapNodeSize, mindmapSizeForShape } from "./mindmapNodeSize.js";
import {
	flowchartNodeSize,
	flowchartSizeForShape,
	flowchartTextArea,
} from "./flowchartNodeSize.js";
import { textWidth } from "./textMetrics.js";

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
let wideWordMetrics = false;
const canvasContext = {
	font: "",
	measureText(text) {
		const size = Number(this.font.match(/([\d.]+)px/)?.[1]) || 16;
		if (wideWordMetrics && /^W+$/.test(text)) return { width: text.length * size * 2 };
		if (wideWordMetrics && /^i+$/.test(text)) return { width: text.length * size * 0.1 };
		return { width: Array.from(text).length * size * 0.61 };
	},
};
beforeAll(() => {
	HTMLCanvasElement.prototype.getContext = () => canvasContext;
});
afterAll(() => {
	HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
});

describe("richTextLines", () => {
	it("reads decimal, bullet, and nested list items as text-only rows", () => {
		const lines = richTextLines(
			'<ol start="3"><li><p>First</p><ul><li><p>Nested</p></li></ul></li>' +
				"<li><p>Second</p></li></ol>"
		);

		expect(lines).toEqual([
			{ text: "First", listType: "ordered", depth: 0, number: 3, mode: "auto", dir: "ltr" },
			{
				text: "Nested",
				listType: "bullet",
				depth: 1,
				number: null,
				mode: "auto",
				dir: "ltr",
			},
			{ text: "Second", listType: "ordered", depth: 0, number: 4, mode: "auto", dir: "ltr" },
		]);
	});

	it("uses plain text when rich HTML is unavailable", () => {
		expect(richTextLines("", "First\nSecond")).toEqual([
			{ text: "First", listType: null, depth: 0, number: null },
			{ text: "Second", listType: null, depth: 0, number: null },
		]);
	});

	it("measures plain text without adding an invisible bullet", () => {
		const text = "A plain canvas label";
		const lines = richTextLines("", text);

		expect(richTextLayoutText(lines)).toBe(text);
		expect(richTextLayoutWidth(lines, { size: 16 })).toBe(textWidth(text, { size: 16 }));
	});

	it("uses only sanitized text when the stored HTML contains unsafe markup", () => {
		const lines = richTextLines("<script>attack()</script><ul><li>Safe</li></ul>");

		expect(lines.map((line) => line.text)).toEqual(["Safe"]);
	});

	it("includes generated markers and indentation in text measurement", () => {
		const lines = richTextLines(
			"<ul><li>Top</li><li><p>Parent</p><ol><li>Child</li></ol></li></ul>"
		);

		expect(richTextLayoutText(lines)).toBe("• Top\n• Parent\n·····1. Child");
	});

	it("preserves empty ordered and bulleted rows, numbering, and nested items", () => {
		const lines = richTextLines(
			'<ol start="4"><li><p></p></li><li><p></p><ul><li></li></ul></li><li><p>Filled</p></li></ol>'
		);

		expect(
			lines.map(({ listType, number, text, continuation, depth }) => ({
				listType,
				number,
				text,
				continuation: Boolean(continuation),
				depth,
			}))
		).toEqual([
			{ listType: "ordered", number: 4, text: "", continuation: false, depth: 0 },
			{ listType: "ordered", number: 5, text: "", continuation: false, depth: 0 },
			{ listType: "bullet", number: null, text: "", continuation: false, depth: 1 },
			{ listType: "ordered", number: 6, text: "Filled", continuation: false, depth: 0 },
		]);
		expect(richTextLayoutText(lines)).toBe("4. \n5. \n·····• \n6. Filled");
	});

	it("includes list markers and nested indentation in node sizing input", () => {
		const text = "x".repeat(20);
		const lines = richTextLines(`<ul><li>${text}<ol><li>${text}</li></ol></li></ul>`);
		const measuredText = richTextLayoutText(lines);
		const plainText = `${text}\n${text}`;

		expect(mindmapNodeSize({ text: measuredText }).h).toBeGreaterThan(
			mindmapNodeSize({ text: plainText }).h
		);
		const listed = flowchartNodeSize({ nodeType: "process", text: measuredText });
		const plain = flowchartNodeSize({ nodeType: "process", text: plainText });
		expect(listed.w * listed.h).toBeGreaterThan(plain.w * plain.h);
	});

	it("resolves paragraphs independently from a list item's marker direction", () => {
		const html = renderRichTextWithDefaultDirection(
			'<ul><li><p dir="rtl">مرحبا</p><p dir="ltr">Hello</p></li></ul>',
			"auto"
		);
		const document = new DOMParser().parseFromString(html, "text/html");
		const item = document.querySelector("li");

		expect(item.getAttribute("dir")).toBe("rtl");
		expect(item.querySelectorAll("p")[0].getAttribute("dir")).toBe("rtl");
		expect(item.querySelectorAll("p")[1].getAttribute("dir")).toBe("ltr");
	});

	it("auto-resolves sibling paragraphs inside one list item independently", () => {
		const html = renderRichTextWithDefaultDirection(
			"<ul><li><p>مرحبا</p><p>Hello</p></li></ul>",
			"auto"
		);
		const paragraphs = new DOMParser()
			.parseFromString(html, "text/html")
			.querySelectorAll("li > p");

		expect(paragraphs[0].getAttribute("dir")).toBe("rtl");
		expect(paragraphs[1].getAttribute("dir")).toBe("ltr");
	});

	it("keeps paragraphs inside one list item as separate direction-aware rows", () => {
		const lines = richTextLines(
			'<ul><li><p dir="rtl">مرحبا</p><p dir="ltr">Hello</p></li></ul>'
		);

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ listType: "bullet", dir: "rtl" });
		expect(lines[1]).toMatchObject({ continuation: true, dir: "ltr" });
		expect(richTextLayoutText(lines)).toBe("• مرحبا\nHello");
	});

	it("includes rich list structure in committed node sizing", () => {
		const content = "A fairly long label that wraps across the node width";
		const plain = {
			text: { content, html: `<p>${content}</p>` },
			flowchart: { nodeType: "process" },
		};
		const listed = {
			...plain,
			text: {
				...plain.text,
				html: `<ul><li><p>${content}</p><ol><li><p>Nested</p></li></ol></li></ul>`,
			},
		};

		expect(mindmapSizeForShape(listed).h).toBeGreaterThan(mindmapSizeForShape(plain).h);
		const listedFlowchart = flowchartSizeForShape(listed);
		const plainFlowchart = flowchartSizeForShape(plain);
		expect(listedFlowchart.w * listedFlowchart.h).toBeGreaterThan(
			plainFlowchart.w * plainFlowchart.h
		);
	});

	it("measures text and nested list gutters with the selected font metrics", () => {
		const lines = richTextLines("<ul><li>Top<ol><li>Nested</li></ol></li></ul>");
		const width = richTextLayoutWidth(lines, {
			size: 10,
			font: "'Vazirmatn', sans-serif",
			bold: true,
		});

		expect(width).toBeGreaterThan("·····1. Nested".length * 10 * 0.61);
		expect(canvasContext.font).toContain("'Vazirmatn', sans-serif");
		expect(canvasContext.font).toContain("700");
	});

	it("sizes to the visually widest word rather than the longest word", () => {
		wideWordMetrics = true;
		const style = { size: 12, font: "'Vazirmatn', sans-serif" };
		try {
			const lines = richTextLines("", "WWWW iiiiiiiii");
			const shape = flowchartNodeSize({
				nodeType: "process",
				text: richTextLayoutText(lines),
				fontSize: style.size,
				font: style.font,
			});

			expect(textWidth("WWWW", style)).toBeGreaterThan(textWidth("iiiiiiiii", style));
			expect(
				flowchartTextArea({ x: 0, y: 0, ...shape, flowchart: { nodeType: "process" } }).w
			).toBeGreaterThanOrEqual(textWidth("WWWW", style));
			expect(canvasContext.font).toContain("'Vazirmatn', sans-serif");
		} finally {
			wideWordMetrics = false;
		}
	});
});

describe("markdownListLines", () => {
	it("keeps nested list type and escapes text before output", () => {
		const lines = richTextLines(
			"<ol><li>First &amp; <em>safe</em> &lt;script&gt;</li>" +
				"<li>Second<ul><li>Nested [text]</li></ul></li></ol>"
		);

		expect(markdownListLines(lines)).toBe(
			"1. First & safe \\<script\\>\n2. Second\n  - Nested \\[text\\]"
		);
	});

	it("keeps a line break inside one list item instead of creating a new item", () => {
		const lines = richTextLines("<ul><li>First<br>- not another item</li></ul>");

		expect(markdownListLines(lines)).toBe("- First<br>- not another item");
	});
});
