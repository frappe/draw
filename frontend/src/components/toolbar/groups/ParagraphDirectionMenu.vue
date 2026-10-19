<script setup>
import { computed, onBeforeUnmount } from "vue";
import { Popover } from "frappe-ui";
import { useBlockSelection } from "@/composables/useBlockSelection.js";
import { activeEditorOwner } from "@/composables/useRichText.js";
import { useTextDirection } from "@/composables/useTextDirection.js";
import {
	openTextFormattingSurface,
	closeTextFormattingSurface,
} from "@/composables/useTextFormatting.js";
import ToolbarButton from "../ToolbarButton.vue";

const { editing } = useBlockSelection();
const direction = useTextDirection();
const surfaceId = "paragraph-direction";
const openedSessions = new Set();

function formattingOpened() {
	const sessionId = activeEditorOwner.value?.sessionId;
	if (sessionId == null) return;
	openedSessions.add(sessionId);
	openTextFormattingSurface(sessionId, surfaceId);
}

function formattingClosed() {
	for (const sessionId of openedSessions) {
		closeTextFormattingSurface(sessionId, surfaceId);
	}
	openedSessions.clear();
}
onBeforeUnmount(formattingClosed);

const status = computed(() => {
	if (direction.mode.value === "mixed") return "Mixed direction settings";
	if (direction.mode.value === "rtl" || direction.mode.value === "ltr") {
		return `${
			editing.value ? "Paragraph" : "Shape"
		} override · ${direction.mode.value.toUpperCase()}`;
	}
	if (editing.value && direction.mode.value === "auto") {
		return `Paragraph · Auto · ${direction.effectiveDirection.value.toUpperCase()} resolved`;
	}
	if (direction.inherited.value) {
		return `From shape · ${direction.effectiveDirection.value.toUpperCase()}`;
	}
	const resolved = direction.effectiveDirection.value;
	return resolved === "mixed"
		? "No override · mixed resolved directions"
		: `No override · ${resolved.toUpperCase()} resolved`;
});
</script>

<template>
	<Popover @open="formattingOpened" @close="formattingClosed">
		<template #trigger>
			<ToolbarButton label="Paragraph" tooltip="Paragraph direction" icon="lucide-pilcrow" />
		</template>
		<template #default="{ close }">
			<div class="w-[208px] p-1" data-text-formatting-surface @mousedown.prevent>
				<div role="group" aria-label="Paragraph direction" class="flex flex-col gap-1">
					<ToolbarButton
						label="Right-to-Left (RTL)"
						icon-left="lucide-arrow-left"
						:active="direction.mode.value === 'rtl'"
						@click="
							direction.toggleMode('rtl');
							close();
						"
					/>
					<ToolbarButton
						label="Left-to-Right (LTR)"
						icon-left="lucide-arrow-right"
						:active="direction.mode.value === 'ltr'"
						@click="
							direction.toggleMode('ltr');
							close();
						"
					/>
				</div>
				<div class="px-2 pt-2 text-xs text-ink-gray-6" aria-live="polite">
					{{ status }}
				</div>
				<div v-if="!editing" class="px-2 pt-1 text-xs text-ink-gray-6">
					Applies to all paragraphs in selected shapes.
				</div>
				<div
					v-if="direction.overridesMixed.value"
					class="px-2 pt-1 text-xs text-ink-gray-6"
				>
					Paragraph overrides vary.
				</div>
			</div>
		</template>
	</Popover>
</template>
