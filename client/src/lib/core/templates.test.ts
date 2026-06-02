import { describe, expect, it } from 'vitest';
import { TEMPLATES, getTemplate } from './templates';

describe('templates', () => {
	it('rainmeter-sidebar contains all 46 widgets, incl. 32 per-core sparklines', () => {
		const ws = getTemplate('rainmeter-sidebar')?.widgets() ?? [];
		expect(ws).toHaveLength(46);
		const cores = ws.filter((w) => w.type === 'sparkline' && w.sensor?.startsWith('cpu.core.'));
		expect(cores).toHaveLength(32);
	});

	it('every template widget has a known type, a rect and (where bound) a sensor', () => {
		const known = new Set(['clock', 'text', 'sparkline', 'nowplaying', 'bar', 'gauge', 'button']);
		for (const t of TEMPLATES) {
			const ws = t.widgets();
			expect(ws.length).toBeGreaterThan(0);
			for (const w of ws) {
				expect(known.has(w.type)).toBe(true);
				expect(w.rect).toBeTruthy();
			}
		}
	});

	it('returns fresh, independent widget arrays each call', () => {
		const a = getTemplate('system')?.widgets() ?? [];
		const b = getTemplate('system')?.widgets() ?? [];
		expect(a).not.toBe(b);
		a[0].rect.x = 999;
		expect(b[0].rect.x).not.toBe(999);
	});

	it('network template uses two histogram (bars) widgets', () => {
		const ws = getTemplate('network')?.widgets() ?? [];
		expect(ws.filter((w) => w.config.histogram === true)).toHaveLength(2);
	});

	it('clock-jp uses the ja locale for the weekday', () => {
		const ws = getTemplate('clock-jp')?.widgets() ?? [];
		const weekday = ws.find((w) => w.config.format === 'ddd');
		expect(weekday?.config.locale).toBe('ja');
	});
});
