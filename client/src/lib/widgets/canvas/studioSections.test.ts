import { describe, expect, it } from 'vitest';
import { SECTIONS } from './studioSections';

describe('studio nav SECTIONS', () => {
	it('lists the sections top-down in the intended order', () => {
		expect(SECTIONS.map((s) => s.id)).toEqual([
			'layouts',
			'widget-designer',
			'sensors',
			'plugins',
			'themes',
			'sacks',
			'saved-layouts',
			'settings'
		]);
	});

	it('puts Settings in the foot group (the <gap> before it)', () => {
		expect(SECTIONS.filter((s) => s.group === 'foot').map((s) => s.id)).toEqual(['settings']);
	});

	it('has unique ids and a non-empty icon + short label for each', () => {
		expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
		for (const s of SECTIONS) {
			expect(s.icon).toBeTruthy();
			expect(s.short).toBeTruthy();
		}
	});

	it('uses a distinct glyph per section (no overloaded icons)', () => {
		const icons = SECTIONS.map((s) => s.icon);
		expect(new Set(icons).size).toBe(icons.length);
	});

	it('keeps the nav glyphs off the in-canvas "copy" (⧉) and "container/grid" (▦) signifiers', () => {
		const icons = SECTIONS.map((s) => s.icon);
		expect(icons).not.toContain('⧉');
		expect(icons).not.toContain('▦');
	});
});
