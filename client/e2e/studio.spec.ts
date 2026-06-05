import { test, expect } from '@playwright/test';
import { gotoStudio, openSection, watchConsole } from './helpers';

// Boot + the canonical template-geometry regression. Layout geometry the happy-dom unit tests can't do
// (no layout engine) is asserted here in a real browser via the dev Tauri mock.

test('studio boots clean: chrome renders, no console errors, no unmocked commands', async ({
	page
}) => {
	const log = watchConsole(page);
	await gotoStudio(page);
	// The whole chrome is gated behind editMode — assert it actually rendered (guards the regression
	// where setEditModeImmediate never fires and the studio shows a bare canvas).
	// the primary toolbar (a secondary `.studio-bar.studio-subbar` may also exist)
	await expect(page.locator('.studio-bar:not(.studio-subbar)')).toBeVisible();
	await expect(page.locator('.nav-rail')).toBeVisible();
	await expect(page.locator('.powerbar')).toBeVisible();
	expect(log.errors, `console errors:\n${log.errors.join('\n')}`).toEqual([]);
	// Self-policing: a new boot-time Tauri command that the dev mock doesn't answer must fail the suite
	// here, not silently return null and corrupt a later test.
	expect(log.mockWarns, `unmocked Tauri commands:\n${log.mockWarns.join('\n')}`).toEqual([]);
});

test('Clock (JP weekday): analog icon stays visible (fill meter) + date row is one line', async ({
	page
}) => {
	await gotoStudio(page);
	await openSection(page, 'widget-designer');
	await page.getByRole('button', { name: 'Clock (JP weekday)', exact: true }).click();

	// The analog clock is a FILL meter; this guards the regression where halign:'left' collapsed its
	// width to 0 and it vanished — it must render with a real box.
	const dial = page.locator('.analog-clock').first();
	await expect(dial).toBeVisible();
	const box = await dial.boundingBox();
	expect(box, 'analog clock has a layout box').not.toBeNull();
	expect((box?.width ?? 0) > 8 && (box?.height ?? 0) > 8, 'analog dial not collapsed').toBeTruthy();

	// The cluster's four digital clocks (time · weekday · date · month) rendered…
	const clocks = page.locator('.np-clock');
	await expect(clocks).toHaveCount(4);

	// …and the last two (date + month) share ONE row, adjacent — the content-basis fix (was spaced /
	// wrapped before). DOM order is time, weekday, date, month.
	const rects = await clocks.evaluateAll((els) =>
		els.map((e) => {
			const r = e.getBoundingClientRect();
			return { x: r.x, y: r.y };
		})
	);
	const date = rects[2];
	const month = rects[3];
	expect(Math.abs(date.y - month.y), 'date + month on the same row').toBeLessThan(24);
	expect(month.x, 'month sits to the right of the day-of-month').toBeGreaterThan(date.x);
});
