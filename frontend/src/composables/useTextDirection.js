import { computed } from "vue";
import {
	activeEditorOwner,
	currentParagraphDirection,
	currentParagraphDirectionMode,
	richCommands,
} from "@/composables/useRichText.js";
import { resolveDirection } from "@/diagram/textDirection.js";
import { richTextLines } from "@/diagram/richTextLists.js";
import { useBlockSelection } from "@/composables/useBlockSelection.js";

export function useTextDirection() {
	const { store, shapes, shapeIds, editing } = useBlockSelection();
	const mode = computed(() => {
		if (editing.value) {
			const paragraphMode = currentParagraphDirectionMode();
			return paragraphMode;
		}
		const modes = new Set(shapes.value.map((shape) => shape.text?.direction || "auto"));
		return modes.size === 1 ? [...modes][0] : "mixed";
	});
	const effectiveDirection = computed(() => {
		if (editing.value) return currentParagraphDirection() || "mixed";
		const directions = new Set(shapes.value.map(shapeDirection));
		return directions.size === 1 ? [...directions][0] : "mixed";
	});
	const overridesMixed = computed(() => {
		const modes = shapes.value.flatMap((shape) =>
			richTextLines(shape.text?.html, shape.text?.content, {
				defaultDirection: shape.text?.direction,
			}).map((line) => line.mode || shape.text?.direction || "ltr")
		);
		return new Set(modes).size > 1;
	});
	const inherited = computed(
		() => editing.value && !currentParagraphDirectionMode() && isManualShapeDirection()
	);

	function toggleMode(value) {
		const nextMode = mode.value === value ? neutralMode() : value;
		if (editing.value) {
			if (activeEditorOwner.value?.store !== store) return false;
			return richCommands.setDirection(nextMode);
		}
		store.setTextDirection(shapeIds.value, nextMode);
		return true;
	}

	function neutralMode() {
		if (!editing.value) return "auto";
		return isManualShapeDirection() ? "auto" : null;
	}

	function isManualShapeDirection() {
		const shapeMode = editingShapeDirection();
		return shapeMode === "ltr" || shapeMode === "rtl";
	}

	return { mode, effectiveDirection, overridesMixed, inherited, toggleMode };
}

function shapeDirection(shape) {
	const mode = shape.text?.direction || "auto";
	return resolveDirection(mode, shape.text?.content);
}

function editingShapeDirection() {
	const owner = activeEditorOwner.value;
	const shape = owner?.store?.shapeById(owner.shapeId);
	return shape?.text?.direction || "auto";
}
