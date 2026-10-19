import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// #261/#262: a selected mind-map or flowchart node shows only its selection outline —
// no resize handles and no rotation knob (both live in the single `<g v-if="single">`
// group). Their add-node CTAs are hover-triggered, not part of selection. Pinned by
// source inspection; SelectionLayer can't mount in the node env (house pattern).
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(dir, "./SelectionLayer.vue"), "utf8");
const shapeViewSrc = readFileSync(path.join(dir, "./ShapeView.vue"), "utf8");

describe("mind-map / flowchart nodes select to a plain border (#261/#262)", () => {
	it("treats both node roles as handle-less", () => {
		expect(src).toContain(
			"single.value?.role === ROLE.mindmapNode || single.value?.role === ROLE.flowchartNode"
		);
	});

	it("gates the resize + rotation handle group off for nodes", () => {
		expect(src).toContain('<g v-if="single && !singleIsNode" :transform="groupTransform">');
	});
});

// #441 item 3: a flowchart node also drops the dashed box entirely. A rectangle
// cannot trace a diamond or a cylinder, so selection is shown by the node's own
// stroke — which is the shape's real outline whatever that shape is.
describe("flowchart nodes select through their own border (#441 item 3)", () => {
	it("leaves both node roles out of the dashed-outline set", () => {
		expect(src).toContain(
			"(shape) => shape.role !== ROLE.mindmapNode && shape.role !== ROLE.flowchartNode,"
		);
	});

	it("draws the heavier selected border for either node role", () => {
		expect(shapeViewSrc).toContain("if (!props.selected || !isNodeRole.value) return own");
	});

	// The pass that actually paints shapes on the UNIFIED canvas is WhiteboardLayer's,
	// not the block layer's. It rendered ShapeView without `selected`, so the heavier
	// border could never appear there — and once the dashed box was taken away from a
	// node, a selected node had no feedback at all.
	it("tells ShapeView which shapes are selected on the unified canvas", () => {
		const whiteboard = readFileSync(path.join(dir, "./WhiteboardLayer.vue"), "utf8");
		expect(whiteboard).toContain(':selected="store.state.selection.includes(item.object.id)"');
	});

	// The label wraps inside the measured area for both roles. An SVG <text> is one
	// unwrapped line, which is how a flowchart label used to lie across its own shape.
	it("wraps a node label in the measured text area rather than an SVG <text>", () => {
		expect(shapeViewSrc).toContain("!isEditingThis &&");
		expect(shapeViewSrc).toContain("!richHtml &&");
		expect(shapeViewSrc).toContain("isNodeRole &&");
		expect(shapeViewSrc).toContain("!isNodeRole &&");
		expect(shapeViewSrc).toContain("shape.text?.content");
	});
});

// #7: even if a node somehow carries a rotation angle (paste, legacy data), ShapeView
// must render it upright — nodes auto-size and never rotate.
describe("mind-map / flowchart nodes never render rotated (#7)", () => {
	it("zeroes the render rotation for node roles", () => {
		expect(shapeViewSrc).toContain("const roleIsNode =");
		expect(shapeViewSrc).toContain('props.shape.role === "mindmap-node"');
		expect(shapeViewSrc).toContain('props.shape.role === "flowchart-node"');
		expect(shapeViewSrc).toContain("const rotation = roleIsNode ? 0 : props.shape.rotation");
	});
});
