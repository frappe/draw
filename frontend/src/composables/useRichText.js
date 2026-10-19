// Rich-text plumbing shared between the inline editor (TextEditor) and the
// right-palette text controls (TextSection). The idea (rich text in shapes) is
// borrowed from frappe/slides; the implementation here is our own and minimal.
//
// StarterKit (TipTap v3) already bundles bold / italic / underline / bullet &
// ordered lists, so we add TextStyle + Color (per-run color), TextAlign, and
// paragraph direction. A module-level `activeEditor` ref points at the
// editor currently being edited, so the palette can run commands on it.

import { computed, ref, shallowRef } from "vue";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { ParagraphDirection, paragraphDirectionState } from "./paragraphDirection.js";

export const RICH_EXTENSIONS = [
	StarterKit,
	TextStyle,
	Color,
	TextAlign.configure({ types: ["paragraph", "heading"] }),
	ParagraphDirection,
];

// The TipTap editor for the shape/connector currently being edited (or null).
export const activeEditor = shallowRef(null);
export const activeEditorOwner = shallowRef(null);
const activeEditorRevision = ref(0);
const activeEditorState = computed(() => ({
	editor: activeEditor.value,
	revision: activeEditorRevision.value,
}));

let activeEditorTransactionHandler = null;

export function setActiveEditor(editor, owner = null) {
	if (activeEditor.value === editor) {
		activeEditorOwner.value = owner;
		return;
	}
	removeActiveEditorListener();
	activeEditor.value = editor;
	activeEditorOwner.value = owner;
	if (!editor) return;
	activeEditorTransactionHandler = () => {
		activeEditorRevision.value += 1;
	};
	editor.on("transaction", activeEditorTransactionHandler);
}
export function clearActiveEditor(editor) {
	if (activeEditor.value !== editor) return;
	removeActiveEditorListener();
	activeEditor.value = null;
	activeEditorOwner.value = null;
}

export function selectRichTextDocument(editor) {
	if (!editor || editor.isDestroyed) return false;
	const doc = editor.state.doc;
	const last = doc.lastChild;
	const beforeLast = doc.childCount > 1 ? doc.child(doc.childCount - 2) : null;
	const lastListItem = beforeLast?.lastChild;
	let from = null;
	let to = null;
	let emptyListItemCursor = null;

	doc.descendants((node, position, parent) => {
		if (node.isText) {
			if (from === null) from = position;
			to = position + node.nodeSize;
		}
		if (node.type.name === "paragraph" && parent === lastListItem && !node.textContent) {
			emptyListItemCursor = position + 1;
		}
	});

	if (from === null || to === null) return false;
	if (
		last?.type.name === "paragraph" &&
		!last.textContent &&
		(beforeLast?.type.name === "bulletList" || beforeLast?.type.name === "orderedList") &&
		lastListItem?.type.name === "listItem" &&
		!lastListItem.textContent &&
		emptyListItemCursor !== null
	) {
		to = emptyListItemCursor;
	}
	return editor.commands.setTextSelection({ from, to });
}

function removeActiveEditorListener() {
	if (activeEditor.value && activeEditorTransactionHandler) {
		activeEditor.value.off("transaction", activeEditorTransactionHandler);
	}
	activeEditorTransactionHandler = null;
}

// Plain text → seed HTML for a shape that only has legacy `content`.
export function contentToHtml(content) {
	const text = String(content || "");
	if (!text) return "<p></p>";
	return text
		.split("\n")
		.map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
		.join("");
}

function escapeHtml(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Command helpers the palette buttons call against the active editor. Each is a
// no-op when nothing is being edited.
function run(fn, shouldFocus = true) {
	const editor = activeEditor.value;
	if (!editor || editor.isDestroyed) return false;
	const chain = editor.chain();
	return fn(shouldFocus ? chain.focus() : chain).run();
}
export const richCommands = {
	toggleBold: () => run((c) => c.toggleBold()),
	toggleItalic: () => run((c) => c.toggleItalic()),
	toggleUnderline: () => run((c) => c.toggleUnderline()),
	toggleStrike: () => run((c) => c.toggleStrike()),
	toggleBulletList: () => run((c) => c.toggleBulletList()),
	toggleOrderedList: () => run((c) => c.toggleOrderedList()),
	toggleList: (listType, { focus = true } = {}) => {
		if (listType === "bulletList") return run((chain) => chain.toggleBulletList(), focus);
		if (listType === "orderedList") return run((chain) => chain.toggleOrderedList(), focus);
		return false;
	},
	setAlign: (align) => run((c) => c.setTextAlign(align)),
	setDirection: (direction) => run((c) => c.setParagraphDirection(direction)),
	setColor: (color) => run((c) => c.setColor(color)),
};

export function currentParagraphDirection() {
	const editor = activeEditorState.value.editor;
	return editor && !editor.isDestroyed
		? paragraphDirectionState(editor.state, editor.storage.paragraphDirection.defaultDirection)
		: null;
}

export function currentParagraphDirectionMode() {
	const editor = activeEditorState.value.editor;
	if (!editor || editor.isDestroyed) return null;
	const selection = editor.state.selection;
	const blocks = [];
	if (selection.empty) {
		for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
			const node = selection.$from.node(depth);
			if (["paragraph", "heading", "codeBlock"].includes(node.type.name)) {
				blocks.push(node);
				break;
			}
		}
	} else {
		editor.state.doc.nodesBetween(selection.from, selection.to, (node, position) => {
			const contentFrom = position + 1;
			const contentTo = position + node.nodeSize - 1;
			if (
				["paragraph", "heading", "codeBlock"].includes(node.type.name) &&
				selection.to > contentFrom &&
				selection.from < contentTo
			) {
				blocks.push(node);
			}
		});
	}
	if (!blocks.length) return null;
	const modes = new Set(
		blocks.map((node) => {
			const mode = node.attrs.dir;
			return mode === "ltr" || mode === "rtl" || mode === "auto" ? mode : null;
		})
	);
	return modes.size === 1 ? [...modes][0] : "mixed";
}

export function isMarkActive(name, attrs) {
	const editor = activeEditorState.value.editor;
	// Guard a destroyed editor (unmounted while still referenced) and TipTap's
	// isActive() throwing "Cannot convert undefined or null to object" on some
	// transient states (empty doc / no selection) — return false ("not active"),
	// otherwise the computed that reads this re-throws on every reactive tick and
	// spams the console (surfaced by the whiteboard text-box + select-all path).
	if (!editor || editor.isDestroyed) return false;
	try {
		return name ? editor.isActive(name, attrs) : editor.isActive(attrs);
	} catch {
		return false;
	}
}
