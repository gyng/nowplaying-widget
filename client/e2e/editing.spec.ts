import { test, expect } from '@playwright/test';
import { gotoStudio, rightClickEmptyCanvas } from './helpers';

// Direct-manipulation editor flows: the right-click → menu → op pipeline, selection, and delete/undo.
// These live entirely in the in-memory editor model (no backend), but need a real layout engine
// (measured rects drive the menu, grid cells, and selection), so they belong in e2e not happy-dom.

test('canvas context menu opens with Split/Add items; Copy debug JSON sits just above Inspect', async ({
	page
}) => {
	await gotoStudio(page);
	await rightClickEmptyCanvas(page);

	const ctx = page.locator('.ctx');
	await expect(ctx).toBeVisible();
	await expect(ctx.getByText('Into 2×2 grid')).toBeVisible();

	const items = await ctx.locator('button').allTextContents();
	const inspectIdx = items.findIndex((t) => /Inspect \(devtools\)/.test(t));
	expect(inspectIdx, 'Inspect item present').toBeGreaterThan(0);
	expect(items[inspectIdx - 1], 'Copy debug JSON is the item just above Inspect').toContain(
		'Copy debug JSON'
	);
});

test('splitting the empty flow root into a 2×2 grid yields a grid container with four cells', async ({
	page
}) => {
	await gotoStudio(page);
	await rightClickEmptyCanvas(page);
	await page.locator('.ctx button', { hasText: 'Into 2×2 grid' }).click();

	const grid = page.locator('[data-kind="grid"]');
	await expect(grid).toHaveCount(1);
	await expect(grid.locator('> [data-kind]'), '2×2 grid has four cell containers').toHaveCount(4);
	// The edit is undoable.
	await expect(page.locator('.studio-bar button[title^="Undo"]')).toBeEnabled();
});

test('clicking a widget selects it and fills the Inspector', async ({ page }) => {
	await gotoStudio(page);
	await page.locator('.widget[data-type="button"] button.drag-overlay').click();
	await expect(page.locator('.widget.selected')).toHaveCount(1);
	await expect(page.locator('.inspector .fields .hd').first()).toContainText('button');
});

test('removing a widget via the context menu drops it; Undo restores it', async ({ page }) => {
	await gotoStudio(page);
	const widgets = page.locator('.widget');
	const before = await widgets.count();
	expect(before).toBeGreaterThan(0);

	await page.locator('.widget[data-type="button"] button.drag-overlay').click({ button: 'right' });
	await page.locator('.ctx button.rm', { hasText: 'Remove' }).click();
	await expect(widgets).toHaveCount(before - 1);

	await page.locator('.studio-bar button[title^="Undo"]').click();
	await expect(widgets).toHaveCount(before);
});
