import { describe, expect, it } from 'vitest';
import { sparklinePoints, sparklineRange } from './sparkline';

describe('sparklineRange', () => {
	it('uses data bounds when min/max are not pinned', () => {
		expect(sparklineRange([2, 5, 1], null, null)).toEqual([1, 5]);
	});

	it('honours pinned bounds', () => {
		expect(sparklineRange([2, 5, 1], 0, 100)).toEqual([0, 100]);
	});
});

describe('sparklinePoints', () => {
	it('maps values across the width with inverted y', () => {
		expect(sparklinePoints([0, 50, 100], 100, 10, 0, 100)).toEqual([
			[0, 10],
			[50, 5],
			[100, 0]
		]);
	});

	it('returns empty for empty history', () => {
		expect(sparklinePoints([], 100, 10)).toEqual([]);
	});

	it('centres a flat series', () => {
		expect(sparklinePoints([5, 5], 100, 10)).toEqual([
			[0, 5],
			[100, 5]
		]);
	});
});
