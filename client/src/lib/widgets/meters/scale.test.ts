import { describe, expect, it } from 'vitest';
import { fraction } from './scale';

describe('fraction', () => {
	it('maps a value to its 0..1 fraction of the range', () => {
		expect(fraction(25, 0, 100)).toBe(0.25);
		expect(fraction(50, 0, 200)).toBe(0.25);
	});

	it('clamps out-of-range values', () => {
		expect(fraction(-10, 0, 100)).toBe(0);
		expect(fraction(150, 0, 100)).toBe(1);
	});

	it('returns 0 for null or a degenerate range', () => {
		expect(fraction(null, 0, 100)).toBe(0);
		expect(fraction(50, 100, 100)).toBe(0);
	});
});
