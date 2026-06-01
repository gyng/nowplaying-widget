import { describe, expect, it } from 'vitest';
import { gaugeFraction } from './gauge';

describe('gaugeFraction', () => {
	it('maps a value to its 0..1 fraction of the range', () => {
		expect(gaugeFraction(25, 0, 100)).toBe(0.25);
		expect(gaugeFraction(50, 0, 200)).toBe(0.25);
	});

	it('clamps out-of-range values', () => {
		expect(gaugeFraction(-10, 0, 100)).toBe(0);
		expect(gaugeFraction(150, 0, 100)).toBe(1);
	});

	it('returns 0 for null or a degenerate range', () => {
		expect(gaugeFraction(null, 0, 100)).toBe(0);
		expect(gaugeFraction(50, 100, 100)).toBe(0);
	});
});
