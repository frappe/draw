// Export a diagram (mind map, flowchart, block, or whiteboard) as a Markdown
// outline (spec 13.5). Pure functions.

import { orderedFlowNodes, stripStepNumber } from "./flowchartModel.js";
import { childrenOf, rootNodes } from "./mindmapModel.js";
import { richTextLines, markdownListLines } from "./richTextLists.js";

// A Markdown outline for the document, dispatched by type.
export function outlineMarkdown(doc) {
	if (doc.diagramType === "mindmap" && doc.mindmap) return mindmapOutline(doc.mindmap);
	if (doc.diagramType === "flowchart" && doc.flowchart) return flowchartOutline(doc.flowchart);
	if (doc.diagramType === "whiteboard" && doc.whiteboard) return listOutline(stickyTexts(doc));
	return shapeOutline(doc.shapes || []);
}

// Indented bullets following the tree, depth = nesting. Every tree on the map is
// listed, one after another (a map can hold several — #48).
function mindmapOutline(mm) {
	const lines = [];
	const walk = (id, depth) => {
		const node = mm.nodes.find((n) => n.id === id);
		if (!node) return;
		lines.push(`${"  ".repeat(depth)}- ${node.text || ""}`.trimEnd());
		for (const child of childrenOf(mm, id)) walk(child.id, depth + 1);
	};
	for (const root of rootNodes(mm)) walk(root.id, 0);
	return lines.join("\n") + "\n";
}

// Numbered steps in flow order (junctions skipped); decision labels noted.
function flowchartOutline(fc) {
	let i = 0;
	const lines = orderedFlowNodes(fc)
		.filter((n) => n.nodeType !== "connector")
		.map((n) => {
			i += 1;
			const text = stripStepNumber(n.text) || `Step ${i}`;
			return `${i}. ${text}`;
		});
	return lines.join("\n") + "\n";
}

function stickyTexts(doc) {
	return (doc.whiteboard.stickyNotes || []).map((n) => n.text).filter(Boolean);
}

function shapeOutline(shapes) {
	const richLines = shapes.flatMap((shape) =>
		richTextLines(shape.text?.html, shape.text?.content)
	);
	if (richLines.some((line) => line.listType)) return `${markdownListLines(richLines)}\n`;
	return listOutline(shapes.map((shape) => shape.text?.content).filter(Boolean));
}

function listOutline(items) {
	if (!items.length) return "- (empty)\n";
	return items.map((t) => `- ${t}`).join("\n") + "\n";
}
