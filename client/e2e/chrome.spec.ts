import { test, expect } from '@playwright/test';
import { gotoStudio, navItem, openSection, previewTemplate } from './helpers';

// Studio shell: NavRail section switching, the designer's modal lock, and two panels that work without
// a backend (Settings autostart, Themes editor). Real-browser state transitions the unit tests skip.

test('NavRail switches sections and marks the active one', async ({ page }) => {
	await gotoStudio(page);

	// Layouts is the default section: the Inspector + Outline dock.
	await expect(navItem(page, 'layouts')).toHaveClass(/active/);
	await expect(page.locator('.inspector')).toBeVisible();
	await expect(page.locator('.outline')).toBeVisible();

	// The widget designer → the template/widget designer list.
	await openSection(page, 'widget-designer');
	await expect(navItem(page, 'widget-designer')).toHaveClass(/active/);
	await expect(page.locator('.designer-list')).toBeVisible();

	// Sensors → a rail panel; the Inspector is gone.
	await openSection(page, 'sensors');
	await expect(navItem(page, 'sensors')).toHaveClass(/active/);
	await expect(page.locator('.rail-panel')).toBeVisible();
	await expect(page.locator('.inspector')).toHaveCount(0);

	// Settings → the Display/Startup/… panel.
	await openSection(page, 'settings');
	await expect(navItem(page, 'settings')).toHaveClass(/active/);
	await expect(page.locator('.rail-panel')).toContainText('Display');
});

test('previewing a template locks the NavRail (modal) until Close', async ({ page }) => {
	await gotoStudio(page);
	await previewTemplate(page, 'Network');

	// Designing/previewing is modal: the nav is aria-disabled and the read-only banner shows.
	await expect(navItem(page, 'layouts')).toHaveAttribute('aria-disabled', 'true');
	await expect(page.locator('.def-banner')).toContainText('Previewing');

	await page.locator('.def-banner button', { hasText: 'Close' }).click();
	await expect(navItem(page, 'layouts')).not.toHaveAttribute('aria-disabled', 'true');
});

test('Settings: launch-at-login starts off and reverts after toggle (mock reports it disabled)', async ({
	page
}) => {
	await gotoStudio(page);
	await openSection(page, 'settings');
	const cb = page
		.locator('label.rp-row', { hasText: 'launch at login' })
		.locator('input[type=checkbox]');
	await expect(cb).not.toBeChecked();
	// Toggling flips optimistically, then reconciles with the OS state (mock is_enabled=false) → reverts.
	await cb.click();
	await expect(cb).not.toBeChecked();
});

test('Themes: Edit theme CSS opens the editor (seeded default) and closes', async ({ page }) => {
	await gotoStudio(page);
	await openSection(page, 'themes');
	await page.locator('.rail-panel button', { hasText: 'Edit theme CSS' }).click();
	const ed = page.locator('.theme-editor');
	await expect(ed).toBeVisible();
	// The CSS editor (lazy CodeMirror, class te-css) mounts, seeded with the default :root tokens since
	// load_theme → null under the mock. CodeMirror renders the doc text into the DOM.
	await expect(ed.locator('.te-css')).toBeVisible();
	await expect(ed).toContainText('--np-accent');
	await ed.locator('button.te-close').click();
	await expect(ed).toBeHidden();
});
