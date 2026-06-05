import { test, expect } from '@playwright/test';
import { gotoStudio, openSection, addWidget } from './helpers';

// Full chrome theming + the custom (borderless) title bar. Real-browser checks: picking a theme must
// repaint the STUDIO CHROME (not just the widgets), and the studio must draw its own title bar with
// window controls instead of relying on an OS frame.

/** The computed background of the studio's full-window backdrop (`.app.studio`). */
function studioBg(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const el = document.querySelector('.app.studio');
		return el ? getComputedStyle(el).backgroundColor : '';
	});
}

test('the theme picker lists grouped built-ins and the user section', async ({ page }) => {
	await gotoStudio(page);
	await openSection(page, 'themes');
	// Grouped headers + a representative preset from two groups.
	await expect(page.locator('.theme-group .rp-hd', { hasText: 'Classic' })).toBeVisible();
	await expect(page.locator('.theme-group .rp-hd', { hasText: 'Dark' })).toBeVisible();
	await expect(page.locator('.theme-row', { hasText: 'App' })).toBeVisible();
	// 'Dracula' is unique (unlike 'Nord', which is also a prefix of 'Nord Light').
	await expect(page.locator('.theme-row', { hasText: 'Dracula' })).toBeVisible();

	// Each built-in row shows a colour swatch (surface fill + accent/fg dots) so the gallery is scannable.
	const appSw = page.locator('.theme-row', { hasText: 'App' }).locator('.np-swatch');
	await expect(appSw).toBeVisible();
	await expect(appSw.locator('.np-swatch-dot')).toHaveCount(2);
});

test('the app-bar theme dropdown shows swatches in its options', async ({ page }) => {
	await gotoStudio(page);
	// Open the title-bar theme quick-switch (the Select next to the "Theme" label) via its caret toggle.
	await page.locator('.studio-bar .sb-select .np-select-caret').first().click();
	// Each Select portals an (empty) menu <ul> to <body>; only the OPEN one renders option children, so
	// target options directly. Built-in options carry a swatch (the dropdown is swatched, not just the panel).
	const options = page.locator('.np-select-option');
	await expect(options.first()).toBeVisible();
	await expect(options.locator('.np-swatch').first()).toBeVisible();
	await expect(
		page.locator('.np-select-option', { hasText: 'Dracula' }).locator('.np-swatch')
	).toHaveCount(1);
});

test('picking a light built-in flips the whole studio chrome light', async ({ page }) => {
	await gotoStudio(page);
	const before = await studioBg(page); // dark default (#0b0b0e)

	await openSection(page, 'themes');
	await page.locator('.theme-row', { hasText: 'Solarized Light' }).click();

	// The chrome backdrop must actually change (themes drive --ui-bg, not just the widget tokens)…
	await expect.poll(() => studioBg(page)).not.toBe(before);
	// …and become light (sum of channels high) — proving a light theme yields a light studio.
	const after = await studioBg(page);
	const channels = (after.match(/\d+/g) ?? []).slice(0, 3).map(Number);
	const sum = channels.reduce((a, b) => a + b, 0);
	expect(sum, `expected a light chrome bg, got ${after}`).toBeGreaterThan(500);
});

test('a colourless widget follows the theme: the analog clock hands track --np-fg', async ({
	page
}) => {
	await gotoStudio(page);
	// A default analog clock sets NO colour, so its hands resolve var(--np-fg) — they must follow a theme.
	await addWidget(page, 'Analog Clock');
	const hand = page.locator('.np-clock-hour').first();
	const handColor = () => hand.evaluate((el) => getComputedStyle(el).backgroundColor);
	const before = await handColor(); // default --np-fg ≈ white

	await openSection(page, 'themes');
	await page.locator('.theme-row', { hasText: 'Solarized Light' }).click();

	// Solarized Light sets --np-fg to a dark ink → the hands repaint dark (proves it tracks the token).
	await expect.poll(handColor).not.toBe(before);
	const after = (await handColor()).match(/\d+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
	expect(
		after.reduce((a, b) => a + b, 0),
		`expected dark hands, got ${after}`
	).toBeLessThan(400);
});

test('the studio draws a custom title bar with window controls', async ({ page }) => {
	await gotoStudio(page);
	const bar = page.locator('.studio-bar').first();
	await expect(bar).toBeVisible();
	// The bar is the window drag region (borderless window — decorations:false).
	expect(await bar.getAttribute('data-tauri-drag-region')).not.toBeNull();
	// Minimize / maximize / close cluster is present (close is the styled red one).
	await expect(bar.locator('.win-controls .winbtn')).toHaveCount(3);
	await expect(bar.locator('.win-controls .winbtn-close')).toBeVisible();
	await expect(bar.locator('img.sb-mascot')).toBeVisible();
});
