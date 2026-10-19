// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDiagramStore } from "./useDiagramStore.js";
import { createDiagramDocument } from "@/diagram/schema.js";
import { flattenSubmodels } from "@/diagram/freeFloating.js";
import { createMindMap, addChild } from "@/diagram/mindmapModel.js";
import { createFlowchart, addFlowchartNode } from "@/diagram/flowchartModel.js";
import { mindmapNodeSize } from "@/diagram/mindmapNodeSize.js";
import { flowchartNodeSize } from "@/diagram/flowchartNodeSize.js";
import { richTextLayoutText, richTextLines } from "@/diagram/richTextLists.js";

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
	HTMLCanvasElement.prototype.getContext = () => ({
		font: "",
		measureText(text) {
			const size = Number(this.font.match(/([\d.]+)px/)?.[1]) || 16;
			return { width: Array.from(text).length * size * 0.61 };
		},
	});
});
afterAll(() => {
	HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
});

const richListHtml =
	'<ul><li><p dir="rtl">خطة الإطلاق</p><ol><li><p>Check the nested release task</p></li></ol></li></ul>';
const richListText = { content: "خطة الإطلاق\nCheck the nested release task", html: richListHtml };

function mindmapStore() {
	const mindmap = createMindMap("Root");
	const id = addChild(mindmap, mindmap.rootId, "Child", "right");
	const document = flattenSubmodels({
		...createDiagramDocument(undefined, "unified"),
		mindmap,
	});
	return { store: createDiagramStore(document), id };
}

function flowchartStore() {
	const flowchart = createFlowchart();
	const id = addFlowchartNode(flowchart, "process", "Old label", 100, 100);
	const document = flattenSubmodels({
		...createDiagramDocument(undefined, "unified"),
		flowchart,
	});
	return { store: createDiagramStore(document), id };
}

describe("committed node sizing uses the same rich-list layout as live editing", () => {
	it("keeps a mind-map node sized for list markers and nested indentation", () => {
		const { store, id } = mindmapStore();
		const shape = store.shapeById(id);
		const expected = mindmapNodeSize({
			text: richTextLayoutText(richTextLines(richListHtml, richListText.content)),
			fontSize: shape.text?.style?.size,
			font: shape.text?.style?.font,
			bold: shape.text?.style?.bold,
			italic: shape.text?.style?.italic,
			isRoot: !shape.mindmap?.parentId,
		});

		store.commitMindmapNodeText(id, richListText);

		expect(store.shapeById(id)).toMatchObject(expected);
		expect(store.shapeById(id).text.html).toBe(richListHtml);
	});

	it("keeps a flowchart node sized for list markers and nested indentation", () => {
		const { store, id } = flowchartStore();
		const shape = store.shapeById(id);
		const expected = flowchartNodeSize({
			nodeType: shape.flowchart.nodeType,
			text: richTextLayoutText(richTextLines(richListHtml, richListText.content)),
			fontSize: shape.text?.style?.size,
			font: shape.text?.style?.font,
			bold: shape.text?.style?.bold,
			italic: shape.text?.style?.italic,
		});

		store.commitFlowchartNodeText(id, richListText);

		expect(store.shapeById(id)).toMatchObject(expected);
		expect(store.shapeById(id).text.html).toBe(richListHtml);
	});
});
