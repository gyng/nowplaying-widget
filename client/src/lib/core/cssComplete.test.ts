import { describe, expect, it } from 'vitest';
import { CSS_PART_HINTS, tokenCompletions } from './cssComplete';
import { DEFAULT_TOKENS } from './tokens';

describe('tokenCompletions', () => {
	it('offers one completion per theme token, with its default value as detail', () => {
		const cs = tokenCompletions();
		expect(cs).toHaveLength(Object.keys(DEFAULT_TOKENS).length);
		const accent = cs.find((c) => c.label === '--np-accent');
		expect(accent?.detail).toBe(DEFAULT_TOKENS['--np-accent']);
		// Every label is a custom property and every detail is non-empty.
		expect(cs.every((c) => c.label.startsWith('--') && c.detail.length > 0)).toBe(true);
	});
});

describe('CSS_PART_HINTS', () => {
	it('includes the common meter parts', () => {
		expect(CSS_PART_HINTS).toContain('label');
		expect(CSS_PART_HINTS).toContain('value');
	});
});
