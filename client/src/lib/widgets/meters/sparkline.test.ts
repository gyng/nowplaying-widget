import { describe, expect, it } from 'vitest';
import { sparklineBars, sparklinePoints, sparklineRange } from './sparkline';

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

describe('sparklineBars', () => {
	it('rises from the baseline (min ?? 0) to each value, evenly slotted', () => {
		// width 100 over 2 samples → slot 50, gap 0.2 → bar width 40, centred (offset 5).
		const bars = sparklineBars([0, 100], 100, 10, 0, 100);
		expect(bars).toEqual([
			{ x: 5, y: 10, w: 40, h: 0 },
			{ x: 55, y: 0, w: 40, h: 10 }
		]);
	});

	it('autoscales the top to the data max when max is null', () => {
		const bars = sparklineBars([5, 10], 100, 20, 0, null);
		expect(bars[0].h).toBe(10); // 5/10 of 20
		expect(bars[1].h).toBe(20); // the max fills the height
	});

	it('clamps out-of-range values and returns empty for no history', () => {
		expect(sparklineBars([150], 10, 10, 0, 100)[0].h).toBe(10); // clamped to 1.0
		expect(sparklineBars([], 10, 10)).toEqual([]);
	});
});
