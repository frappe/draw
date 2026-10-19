import { describe, expect, it } from "vitest";
import { createDiagramStore } from "./useDiagramStore.js";
import { parseDiagramDocument } from "@/diagram/schema.js";

describe("paragraph direction document lifecycle", () => {
	it("saves, reopens, duplicates, and undoes HTML direction with its formatting", () => {
		const store = createDiagramStore();
		const id = store.addShape({
			type: "rectangle",
			x: 10,
			y: 20,
			w: 300,
			h: 100,
			text: { content: "فارسی English", html: "<p><strong>فارسی English</strong></p>" },
		});
		store.breakHistoryCoalescing();
		const directed = '<p dir="rtl"><strong>فارسی English</strong></p>';
		store.updateShape(id, { text: { html: directed } });
		expect(store.shapeById(id).text.html).toBe(directed);
		store.undo();
		expect(store.shapeById(id).text.html).not.toContain("dir=");
		store.redo();
		expect(store.shapeById(id).text.html).toBe(directed);

		const [copyId] = store.duplicate([id]);
		expect(store.shapeById(copyId).text.html).toBe(directed);
		const reopened = createDiagramStore();
		reopened.loadDocument(parseDiagramDocument(JSON.stringify(store.getDocument())));
		expect(reopened.shapeById(id).text.html).toBe(directed);
		expect(reopened.shapeById(copyId).text.html).toBe(directed);
	});

	it("keeps old documents without direction metadata", () => {
		const store = createDiagramStore();
		const id = store.addShape({ type: "text", text: { content: "Legacy English" } });
		const reopened = createDiagramStore(
			parseDiagramDocument(JSON.stringify(store.getDocument()))
		);
		expect(reopened.shapeById(id).text.content).toBe("Legacy English");
		expect(reopened.shapeById(id).text.html).toBeUndefined();
	});
});
