import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { closeHistory } from "@tiptap/pm/history";
import { resolveDirection, validDirectionMode } from "@/diagram/textDirection.js";

const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);
const DIRECTION_HISTORY_BOUNDARY = "paragraphDirectionHistoryBoundary";

function selectedParagraphs(state) {
	const { doc, selection } = state;
	const paragraphs = [];
	if (selection.empty) {
		for (let depth = selection.$from.depth; depth > 0; depth--) {
			if (TEXT_BLOCKS.has(selection.$from.node(depth).type.name)) {
				paragraphs.push({
					node: selection.$from.node(depth),
					pos: selection.$from.before(depth),
				});
				break;
			}
		}
	} else {
		doc.nodesBetween(selection.from, selection.to, (node, pos) => {
			const contentFrom = pos + 1;
			const contentTo = pos + node.nodeSize - 1;
			if (
				TEXT_BLOCKS.has(node.type.name) &&
				selection.to > contentFrom &&
				selection.from < contentTo
			) {
				paragraphs.push({ node, pos });
			}
		});
	}
	return paragraphs;
}

export function paragraphDirectionState(state, defaultDirection = "auto") {
	if (!state) return null;
	const paragraphs = selectedParagraphs(state);
	if (!paragraphs.length) return null;
	const directions = new Set(
		paragraphs.map(({ node }) =>
			resolveDirection(node.attrs.dir || defaultDirection || "auto", node.textContent)
		)
	);
	return directions.size === 1 ? [...directions][0] : "mixed";
}

function setDirection(state, dispatch, direction) {
	const paragraphs = selectedParagraphs(state);
	if (!paragraphs.length) return false;
	if (!dispatch) return true;
	const transaction = state.tr;
	for (const { node, pos } of paragraphs) {
		if (node.attrs.dir !== direction) {
			transaction.setNodeMarkup(pos, undefined, { ...node.attrs, dir: direction });
		}
	}
	if (transaction.docChanged) {
		closeHistory(transaction);
		transaction.setMeta(DIRECTION_HISTORY_BOUNDARY, true);
		dispatch(transaction);
	}
	return true;
}

function renderedDirection(mode, text, fallback) {
	return resolveDirection(mode || fallback || "auto", text);
}

function directionDecorations(state, editor) {
	const decorations = [];
	const defaultDirection = editor.storage.paragraphDirection.defaultDirection;
	state.doc.descendants((node, pos) => {
		if (TEXT_BLOCKS.has(node.type.name)) {
			const mode = validDirectionMode(node.attrs.dir) || defaultDirection || "auto";
			decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: mode }));
		}
		if (node.type.name !== "listItem") return;
		const block = node.firstChild;
		const mode = validDirectionMode(block?.attrs.dir) || defaultDirection || "auto";
		decorations.push(
			Decoration.node(pos, pos + node.nodeSize, {
				dir: renderedDirection(mode, block?.textContent, "ltr"),
			})
		);
	});
	return DecorationSet.create(state.doc, decorations);
}

export const ParagraphDirection = Extension.create({
	name: "paragraphDirection",

	addStorage() {
		return { defaultDirection: "auto" };
	},

	addGlobalAttributes() {
		return [
			{
				types: [...TEXT_BLOCKS],
				attributes: {
					dir: {
						default: null,
						parseHTML: (element) => {
							const direction = element.closest("[dir]")?.getAttribute("dir");
							return validDirectionMode(direction);
						},
						renderHTML: (attributes) =>
							validDirectionMode(attributes.dir) ? { dir: attributes.dir } : {},
					},
				},
			},
		];
	},

	addCommands() {
		return {
			setParagraphDirection:
				(direction) =>
				({ state, dispatch }) =>
					direction === null || validDirectionMode(direction)
						? setDirection(state, dispatch, direction)
						: false,
		};
	},

	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin({
				props: {
					decorations: (state) => directionDecorations(state, editor),
				},
				appendTransaction(transactions, _oldState, state) {
					if (
						!transactions.some((transaction) =>
							transaction.getMeta(DIRECTION_HISTORY_BOUNDARY)
						)
					) {
						return null;
					}
					return closeHistory(state.tr);
				},
			}),
		];
	},
});
