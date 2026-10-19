import { test, expect } from "../helpers/fixtures.js";
import { exitTextEdit, surfaceBox, TEXT_EDITOR, TOOLBAR } from "../helpers/editor.js";

test("Paragraph direction survives list editing, save, and reopen", async ({ page, diagram }) => {
	const name = await diagram.open("unified", { empty: true });
	const canvas = await surfaceBox(page);
	await page.mouse.dblclick(canvas.x + 400, canvas.y + 350);

	const editor = page.locator(`${TEXT_EDITOR} .ProseMirror`);
	await expect(editor).toBeVisible();
	await page.keyboard.type("این پروژه با Frappe 3 توسعه یافته است.");
	const firstParagraph = editor.locator("p").first();
	await expect(firstParagraph).toHaveAttribute("dir", "auto");
	await expect
		.poll(() => firstParagraph.evaluate((node) => getComputedStyle(node).direction))
		.toBe("rtl");
	const paragraphControl = page.locator(TOOLBAR).getByRole("button", {
		name: "Paragraph",
		exact: true,
	});
	await paragraphControl.click();
	const rtlButton = page.getByRole("button", { name: "Right-to-Left (RTL)" });
	const ltrButton = page.getByRole("button", { name: "Left-to-Right (LTR)" });
	await expect(rtlButton).toHaveAttribute("aria-pressed", "false");
	await expect(ltrButton).toHaveAttribute("aria-pressed", "false");
	await ltrButton.click();
	await expect(editor.locator('p[dir="ltr"]')).toHaveCount(1);
	await paragraphControl.click();
	await expect(ltrButton).toHaveAttribute("aria-pressed", "true");
	await rtlButton.click();
	await expect(editor.locator('p[dir="rtl"]')).toHaveCount(1);
	await expect(editor).toBeFocused();

	await page.keyboard.press("Enter");
	await page.keyboard.type("1. مرحبا Frappe 50%");
	await expect(editor.locator('ol > li[dir="rtl"]')).toHaveCount(1);
	await expect(editor.locator('ol > li > p[dir="rtl"]')).toHaveCount(1);
	await exitTextEdit(page);

	await expect
		.poll(async () => (await diagram.saved(name)).shapes[0]?.text?.html, { timeout: 20_000 })
		.toContain('<p dir="rtl">');
	const savedHtml = (await diagram.saved(name)).shapes[0]?.text?.html;
	expect(savedHtml).not.toContain('<li dir="rtl">');
	await page.goto(`/draw/d/${name}`);
	await page.waitForLoadState("networkidle");
	await expect(page.locator('.fd-richtext ol > li[dir="rtl"]')).toHaveCount(1);
	await expect(page.locator('.fd-richtext p[dir="rtl"]')).toHaveCount(2);
});

test("formatting controls do not lose text when editing switches to another shape", async ({
	page,
	diagram,
}) => {
	const name = await diagram.open("unified", { empty: true });
	const canvas = await surfaceBox(page);
	await page.mouse.dblclick(canvas.x + 400, canvas.y + 350);
	const editor = page.locator(`${TEXT_EDITOR} .ProseMirror`);
	await expect(editor).toBeVisible();
	await page.keyboard.type("Keep this text after formatting");

	const fontSize = page.getByRole("textbox", { name: "Font size" });
	await fontSize.fill("24");
	await fontSize.press("Enter");
	await page.locator(TOOLBAR).getByRole("button", { name: "Align center" }).click();
	await page.getByRole("button", { name: "Align left" }).click();
	await page.locator(TOOLBAR).getByRole("button", { name: "Paragraph", exact: true }).click();
	await page.getByRole("button", { name: "Right-to-Left (RTL)" }).click();

	// Double-clicking a different canvas position ends the first session before the
	// second shape becomes the active editing target.
	await page.mouse.dblclick(canvas.x + 1000, canvas.y + 350);
	await expect(editor).toBeVisible();
	await exitTextEdit(page);

	await expect
		.poll(async () => (await diagram.saved(name)).shapes.length, { timeout: 20_000 })
		.toBe(2);
	const saved = (await diagram.saved(name)).shapes;
	const first = saved.find((shape) => shape.text?.content === "Keep this text after formatting");
	expect(first).toBeTruthy();
	expect(first.text.style.size).toBe(24);
	expect(first.text.html).toContain('dir="rtl"');
	expect(first.text.html).toContain("text-align: left");
});
