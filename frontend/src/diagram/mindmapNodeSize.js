// The one place a mind-map node's box is derived from its text (#427 item 5).
//
// Before this module the two mind-map representations disagreed: the framed
// layout measured a node from its text, while a free-floating node was born at a
// hardcoded 140×40 and only ever grew in height, from the text editor, using
// different padding maths. The layout then spaced a tree against boxes that were
// not the boxes on screen, which is what made unrelated branches jump (#427
// item 8). Every caller — creation, layout, the renderer's text inset and the
// live editor — now measures here, so those boxes are the same box.
//
// Use canvas metrics for the selected font when the browser provides them. Headless
// callers use the calibrated width fallback, so model tests stay deterministic.
// The live editor and committed store call this same helper to keep their boxes in step.

import { wrapLineCount, charsPerLine, textWidth, wrapTextToWidth } from "./textMetrics.js";
import { richTextLayoutText, richTextLines } from "./richTextLists.js";

// Padding is the TOTAL inset on each axis: a box is its text plus PAD, and the
// text area is the box minus PAD. Split evenly between the two sides.
export const NODE_PAD_X = 28;
export const NODE_PAD_Y = 18;

export const NODE_MIN_WIDTH = 140; // resting pill width
export const NODE_MAX_WIDTH = 200; // past this the text wraps and the box grows down
export const LINE_HEIGHT = 22;

// The metrics are calibrated at this font size and scale linearly from it.
const BASE_FONT_SIZE = 14;
const ROOT_FONT_SIZE = 17;
const CHAR_WIDTH = 8.5;

// Every free-floating mind-map node renders its label at this size. Anything that
// measures a node it has not created yet — the "+" ghost, a placeholder box — must
// measure at this size too, or it promises a box the click will not produce.
export const NODE_FONT_SIZE = 16;

function clamp(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, value));
}

// How much bigger than the calibrated metrics this node's text is.
function fontScaleOf(fontSize, isRoot) {
	return (fontSize || (isRoot ? ROOT_FONT_SIZE : BASE_FONT_SIZE)) / BASE_FONT_SIZE;
}

// The box for a node holding `text`. Width grows with the text up to the cap;
// beyond it the text wraps and the box grows downward with no vertical limit.
export function mindmapNodeSize({
	text = "",
	fontSize = null,
	isRoot = false,
	font = "Inter, sans-serif",
	bold = false,
	italic = false,
} = {}) {
	const scale = fontScaleOf(fontSize, isRoot);
	const charWidth = CHAR_WIDTH * scale;
	const style = {
		size: fontSize || (isRoot ? ROOT_FONT_SIZE : BASE_FONT_SIZE),
		font,
		bold,
		italic,
	};
	const content = String(text || "");
	const hasFontMetrics = content.length < 5000 && textWidth("M", style) > 0;
	// A label can carry hard line breaks (Enter inside a node keeps typing on a new
	// line), and those are lines the box has to pay for — wrapping alone would fold
	// them into one and clip everything below the first (#427).
	const paragraphs = content.split(/\r?\n/);
	// Padding is a fixed frame around the text, not a scaled one: a bigger font
	// needs more room for glyphs, not more empty margin.
	const singleLine =
		paragraphs.reduce(
			(widest, line) =>
				Math.max(
					widest,
					hasFontMetrics ? textWidth(line, style) : line.length * charWidth
				),
			0
		) + NODE_PAD_X;
	const width = clamp(singleLine, NODE_MIN_WIDTH * scale, NODE_MAX_WIDTH * scale);
	const perLine = charsPerLine(width - NODE_PAD_X, charWidth);
	const lines = paragraphs.reduce(
		(total, line) =>
			total +
			(hasFontMetrics
				? wrapTextToWidth(line, width - NODE_PAD_X, style).length
				: wrapLineCount(line, perLine)),
		0
	);
	return { w: Math.round(width), h: Math.round(lines * LINE_HEIGHT * scale + NODE_PAD_Y) };
}

// The same measurement for a free-floating node SHAPE, which carries its text
// and font size in the shared shape fields rather than in a sub-model node.
export function mindmapSizeForShape(shape) {
	const style = shape?.text?.style || {};
	return mindmapNodeSize({
		text: shapeLayoutText(shape),
		fontSize: style.size,
		font: style.font,
		bold: style.bold,
		italic: style.italic,
		isRoot: !shape?.mindmap?.parentId,
	});
}

function shapeLayoutText(shape) {
	const text = shape?.text || {};
	return richTextLayoutText(
		richTextLines(text.html, text.content, { defaultDirection: text.direction })
	);
}

// The padded rect the label lives in, in absolute canvas units. The renderer and
// the live editor both lay out inside this, so the wrap the box was measured for
// is the wrap that is drawn.
export function mindmapTextArea(shape) {
	const inset = { x: NODE_PAD_X / 2, y: NODE_PAD_Y / 2 };
	return {
		x: shape.x + inset.x,
		y: shape.y + inset.y,
		w: Math.max(8, shape.w - NODE_PAD_X),
		h: Math.max(8, shape.h - NODE_PAD_Y),
	};
}
