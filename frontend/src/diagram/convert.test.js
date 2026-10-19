// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { outlineMarkdown } from "./convert.js";
import { createMindMap, addChild } from "./mindmapModel.js";
import { createFlowchart, addFlowchartNode, addFlowchartEdge } from "./flowchartModel.js";

describe("diagram outline export", () => {
	it("exports a mind map as an indented Markdown outline", () => {
		const mm = createMindMap("Root");
		const a = addChild(mm, mm.rootId, "A");
		addChild(mm, a, "A1");
		const md = outlineMarkdown({ diagramType: "mindmap", mindmap: mm });
		expect(md).toBe("- Root\n  - A\n    - A1\n");
	});

	it("exports a flowchart as a numbered Markdown outline", () => {
		const fc = createFlowchart();
		const a = addFlowchartNode(fc, "terminator", "Start", 0, 0);
		const b = addFlowchartNode(fc, "process", "Work", 0, 100);
		addFlowchartEdge(fc, a, b);
		const md = outlineMarkdown({ diagramType: "flowchart", flowchart: fc });
		expect(md).toBe("1. Start\n2. Work\n");
	});

	it("preserves rich list type, nesting, and escaped text for block shapes", () => {
		const md = outlineMarkdown({
			diagramType: "block",
			shapes: [
				{
					text: {
						content: "First & Second",
						html:
							"<ol><li><p>First &amp; <strong>Second</strong></p>" +
							"<ul><li><p>Nested [task]</p></li></ul></li></ol>",
					},
				},
			],
		});

		expect(md).toBe("1. First & Second\n  - Nested \\[task\\]\n");
	});

	it("does not change plain-text shape outline formatting", () => {
		const md = outlineMarkdown({
			diagramType: "block",
			shapes: [{ text: { content: "First task" } }, { text: { content: "Second task" } }],
		});

		expect(md).toBe("- First task\n- Second task\n");
	});
});
