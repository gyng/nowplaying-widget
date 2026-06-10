import { describe, expect, it } from 'vitest';
import { sackSummary } from './useSacks';

describe('sackSummary', () => {
	it('joins widgets, theme, and overrides with middots (singular/plural aware)', () => {
		expect(sackSummary({ name: 's', widgets: 5, theme: 'Nord', tokens: 3 })).toBe(
			'5 widgets · theme “Nord” · 3 token overrides'
		);
		expect(sackSummary({ name: 's', widgets: 1, theme: null, tokens: 1 })).toBe(
			'1 widget · 1 token override'
		);
	});

	it('reports an empty sack and an unreadable file distinctly', () => {
		expect(sackSummary({ name: 's', widgets: 0, theme: null, tokens: 0 })).toBe('empty');
		expect(sackSummary({ name: 's', widgets: null, theme: null, tokens: 0 })).toBe(
			'unreadable — not a sack?'
		);
	});
});
