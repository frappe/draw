import { test, expect } from "../helpers/fixtures.js";
import { exitTextEdit, selectShape, surfaceBox, TEXT_EDITOR, TOOLBAR } from "../helpers/editor.js";
import fs from "node:fs/promises";

async function exportSvg(page) {
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await page.getByText("Format", { exact: true }).waitFor({ state: "visible" });
	await page.getByText("SVG", { exact: true }).first().click();
	const action = page.getByText("Export SVG", { exact: true }).first();
	await action.waitFor({ state: "visible" });
	const [download] = await Promise.all([page.waitForEvent("download"), action.click()]);
	return fs.readFile(await download.path(), "utf8");
}

test("shared editor lists persist, copy with a shape, reopen, and export safely", async ({
	page,
	diagram,
}) => {
	const name = await diagram.open("unified", { empty: true });
	const canvas = await surfaceBox(page);
	await page.mouse.dblclick(canvas.x + 400, canvas.y + 350);

	const editor = page.locator(`${TEXT_EDITOR} .ProseMirror`);
	await expect(editor).toBeVisible();
	await page.keyboard.type("1. First task");
	await expect(editor.locator("ol li")).toHaveCount(1);
	await page.keyboard.press("Enter");
	await page.keyboard.type("Second task");
	await expect(editor.locator("ol li")).toHaveCount(2);

	const numberedButton = page.locator(TOOLBAR).getByRole("button", {
		name: "Numbered list",
		exact: true,
	});
	await expect(numberedButton).toHaveAttribute("aria-pressed", "true");
	const bulletButton = page.locator(TOOLBAR).getByRole("button", {
		name: "Bulleted list",
		exact: true,
	});
	await bulletButton.click();
	await expect(editor.locator("ul li")).toHaveCount(2);
	await expect(editor).toBeFocused();
	await expect(bulletButton).toHaveAttribute("aria-pressed", "true");
	await expect(numberedButton).toHaveAttribute("aria-pressed", "false");
	await numberedButton.click();
	await expect(editor.locator("ol li")).toHaveCount(2);
	await expect(editor).toBeFocused();
	await expect(numberedButton).toHaveAttribute("aria-pressed", "true");
	await exitTextEdit(page);

	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain("<ol>");
	const original = (await diagram.saved(name)).shapes[0];

	await selectShape(page, page.locator(`[data-shape-id="${original.id}"]`), "rich-text list");
	await page.keyboard.press("Control+c");
	await page.keyboard.press("Control+v");
	await expect
		.poll(async () => (await diagram.saved(name)).shapes.length, { timeout: 20_000 })
		.toBe(2);
	expect((await diagram.saved(name)).shapes.map((shape) => shape.text.html)).toEqual([
		original.text.html,
		original.text.html,
	]);

	await page.goto(`/draw/d/${name}`);
	await page.waitForLoadState("networkidle");
	await page.locator("[data-fdpreset]").first().waitFor({ state: "visible" });
	await expect(page.locator(".fd-richtext ol li")).toHaveCount(4);

	const svg = await exportSvg(page);
	expect(svg.match(/1\. First task/g)).toHaveLength(2);
	expect(svg.match(/2\. Second task/g)).toHaveLength(2);
	expect(svg).not.toContain("<ol>");
});

test("toolbar list buttons format the selected paragraphs without losing selection content", async ({
	page,
	diagram,
}) => {
	await diagram.open("unified", { empty: true });
	const canvas = await surfaceBox(page);
	await page.mouse.dblclick(canvas.x + 400, canvas.y + 350);

	const editor = page.locator(`${TEXT_EDITOR} .ProseMirror`);
	await expect(editor).toBeVisible();
	await page.keyboard.press("Control+b");
	await page.keyboard.type("First task");
	await page.keyboard.press("Control+b");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Second task");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Outside paragraph");

	await editor.evaluate((root) => {
		const paragraphs = root.querySelectorAll("p");
		const firstText = paragraphs[0].querySelector("strong").firstChild;
		const lastText = paragraphs[1].firstChild;

		const range = document.createRange();
		range.setStart(firstText, 0);
		range.setEnd(lastText, lastText.textContent.length);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await expect
		.poll(() => editor.evaluate(() => window.getSelection().toString()))
		.toContain("First task");
	await expect
		.poll(() => editor.evaluate(() => window.getSelection().toString()))
		.toContain("Second task");
	expect(await editor.evaluate(() => window.getSelection().toString())).not.toContain(
		"Outside paragraph"
	);

	const bulletButton = page.locator(TOOLBAR).getByRole("button", {
		name: "Bulleted list",
		exact: true,
	});
	const numberedButton = page.locator(TOOLBAR).getByRole("button", {
		name: "Numbered list",
		exact: true,
	});
	await bulletButton.click();
	await expect(editor.locator("ul > li")).toHaveCount(2);
	await expect(editor.locator("ul strong")).toHaveText("First task");
	await expect(editor.locator(":scope > p")).toHaveCount(1);
	await expect(editor).toContainText("Outside paragraph");
	await expect(editor).toBeFocused();
	await expect(bulletButton).toHaveAttribute("aria-pressed", "true");

	await numberedButton.click();
	await expect(editor.locator("ol > li")).toHaveCount(2);
	await expect(editor.locator("ul")).toHaveCount(0);
	await expect(editor.locator("ol strong")).toHaveText("First task");
	await expect(editor.locator(":scope > p")).toHaveCount(1);
	await expect(numberedButton).toHaveAttribute("aria-pressed", "true");

	await editor.evaluate((root) => {
		const paragraphs = root.querySelectorAll("ol li p");
		const firstText = paragraphs[0].querySelector("strong").firstChild;
		const lastText = paragraphs[1].firstChild;
		const range = document.createRange();
		range.setStart(firstText, 0);
		range.setEnd(lastText, lastText.textContent.length);
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await numberedButton.click();
	await expect(editor.locator("ol")).toHaveCount(0);
	await expect(editor.locator(":scope > p")).toHaveCount(3);
	await expect(editor).toContainText("First task");
	await expect(editor).toContainText("Second task");
	await expect(editor).toContainText("Outside paragraph");
});

test("list buttons format one selected shape, exit editing, and undo and redo atomically", async ({
	page,
	diagram,
}) => {
	const name = await diagram.open("unified", { empty: true });
	const canvas = await surfaceBox(page);
	await page.mouse.dblclick(canvas.x + 400, canvas.y + 350);

	const editor = page.locator(`${TEXT_EDITOR} .ProseMirror`);
	await expect(editor).toBeVisible();
	await page.keyboard.type("First task");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Second task");
	await exitTextEdit(page);

	const shape = (await diagram.saved(name)).shapes[0];
	await selectShape(page, page.locator(`[data-shape-id="${shape.id}"]`), "listable text");
	const bulletButton = page.locator(TOOLBAR).getByRole("button", {
		name: "Bulleted list",
		exact: true,
	});
	const numberedButton = page.locator(TOOLBAR).getByRole("button", {
		name: "Numbered list",
		exact: true,
	});
	await expect(bulletButton).toBeEnabled();
	await expect(numberedButton).toBeEnabled();
	await bulletButton.click();

	await expect(page.locator(TEXT_EDITOR)).toBeHidden();
	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain("<ul>");
	await expect(bulletButton).toHaveAttribute("aria-pressed", "true");

	await numberedButton.click();
	await expect(page.locator(TEXT_EDITOR)).toBeHidden();
	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain("<ol>");
	await expect(numberedButton).toHaveAttribute("aria-pressed", "true");

	await page.keyboard.press("Meta+z");
	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain("<ul>");
	await page.keyboard.press("Meta+Shift+z");
	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain("<ol>");

	await numberedButton.click();
	await expect(page.locator(TEXT_EDITOR)).toBeHidden();
	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.not.toContain("<ol>");
	const saved = (await diagram.saved(name)).shapes[0].text;
	expect(saved.content).toContain("First task");
	expect(saved.content).toContain("Second task");
	expect(saved.html).not.toContain("<li>");

	await numberedButton.click();
	await expect(page.locator(TEXT_EDITOR)).toBeHidden();
	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain("<ol>");
	expect((await diagram.saved(name)).shapes[0].text.html.match(/<li>/g)).toHaveLength(2);

	await numberedButton.click();
	await expect(page.locator(TEXT_EDITOR)).toBeHidden();
	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.not.toContain("<ol>");
	const toggledOff = (await diagram.saved(name)).shapes[0].text;
	expect(toggledOff.html).not.toContain("<li>");
	expect(toggledOff.content).toContain("First task");
	expect(toggledOff.content).toContain("Second task");
});
