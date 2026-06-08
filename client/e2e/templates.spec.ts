import { test, expect } from '@playwright/test';
import { gotoStudio, previewTemplate } from './helpers';

// Built-in template geometry — the flow-layout regressions the migration fixed. Asserted as RELATIVE
// box relationships (x/y ordering, width ratios) so they hold under the design canvas's zoom-to-fit.
// No live telemetry under the mock, so values render '–' / empty bars; only the LAYOUT is asserted.

test('System monitor: VRAM under RAM, GPU under CPU, rows stacked, 8-column cores grid', async ({
	page
}) => {
	await gotoStudio(page);
	await previewTemplate(page, 'System monitor');
	// The per-core grid is a single <canvas> (.np-cpu-cores-canvas) that lays columns out internally;
	// the old .np-cpu-cores CSS grid is gone (it leaked WebView2 memory — see CpuCoresCanvas).
	await expect(page.locator('.np-cpu-cores-canvas')).toBeVisible();

	const g = await page.evaluate(() => {
		const cell = (lbl: string) => {
			const span = Array.from(document.querySelectorAll('.np-text .label')).find(
				(s) => s.textContent?.trim() === lbl
			);
			const host = span && (span.closest('[data-type="text"]') || span.closest('.np-text'));
			if (!host) throw new Error(`missing value cell: ${lbl}`);
			const r = host.getBoundingClientRect();
			return { x: r.x, y: r.y };
		};
		const cores = document.querySelector('.np-cpu-cores-canvas');
		if (!cores) throw new Error('missing cores grid');
		return {
			cpu: cell('CPU'),
			ram: cell('RAM'),
			swap: cell('SWAP'),
			gpu: cell('GPU'),
			vram: cell('VRAM'),
			coresY: cores.getBoundingClientRect().y,
			// The grid is canvas-internal now; the effective column count is surfaced as data-cols.
			coreTracks: Number(cores.getAttribute('data-cols')),
			npText: document.querySelectorAll('.np-text').length
		};
	});

	expect(g.npText).toBe(5);
	expect(Math.abs(g.gpu.x - g.cpu.x), 'GPU column aligns under CPU').toBeLessThan(2);
	expect(Math.abs(g.vram.x - g.ram.x), 'VRAM column aligns under RAM').toBeLessThan(2);
	expect(g.gpu.y, 'GPU/VRAM row sits below the CPU/RAM/SWAP row').toBeGreaterThan(g.cpu.y);
	expect(g.coreTracks, 'per-core grid has 8 columns').toBe(8);
	expect(g.coresY, 'cores grid fills below the value rows').toBeGreaterThan(g.gpu.y);
});

test('Network: up histogram above down, fixed equal-height rows, up-rate left of down-rate', async ({
	page
}) => {
	await gotoStudio(page);
	await previewTemplate(page, 'Network');
	await expect(page.locator('[data-type="sparkline"][data-sensor="net.up"]')).toBeVisible();

	const g = await page.evaluate(() => {
		const box = (sel: string) => {
			const el = document.querySelector(sel);
			if (!el) throw new Error(`missing ${sel}`);
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height };
		};
		const rate = (sensor: string) => {
			const host = document.querySelector(`[data-type="text"][data-sensor="${sensor}"]`);
			const v = host?.querySelector('.value');
			if (!host || !v || !v.parentElement) throw new Error(`missing rate cell ${sensor}`);
			return {
				x: host.getBoundingClientRect().x,
				justify: getComputedStyle(v.parentElement).justifyContent,
				tnum: getComputedStyle(v).fontVariantNumeric
			};
		};
		return {
			up: box('[data-type="sparkline"][data-sensor="net.up"]'),
			down: box('[data-type="sparkline"][data-sensor="net.down"]'),
			upRate: rate('net.up'),
			downRate: rate('net.down'),
			sparks: document.querySelectorAll('[data-type="sparkline"]').length
		};
	});

	expect(g.sparks).toBe(2);
	expect(g.up.y, 'up histogram above down').toBeLessThan(g.down.y);
	expect(Math.abs(g.up.h - g.down.h), 'fixed equal-height rows (no vertical shift)').toBeLessThan(
		2
	);
	expect(Math.abs(g.up.w - g.down.w), 'histograms same width (stretch)').toBeLessThan(2);
	expect(g.upRate.x, 'up rate sits left of down rate').toBeLessThan(g.downRate.x);
	expect(g.upRate.justify, 'up value right-anchored').toBe('flex-end');
	expect(g.downRate.justify, 'down value left-anchored').not.toBe('flex-end');
	expect(g.upRate.tnum, 'tabular digits (no horizontal shift)').toContain('tabular-nums');
});
