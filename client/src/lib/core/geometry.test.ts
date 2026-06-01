import { describe, expect, it } from 'vitest';
import { moveRect, snap } from './geometry';

describe('snap', () => {
	it('snaps to a grid', () => {
		expect(snap(13, 8)).toBe(16);
		expect(snap(11, 8)).toBe(8);
		expect(snap(20, 8)).toBe(24);
	});

	it('rounds to integers when grid <= 1', () => {
		expect(snap(13.6, 1)).toBe(14);
		expect(snap(13.2, 1)).toBe(13);
	});
});

describe('moveRect', () => {
	it('translates the origin and preserves size', () => {
		expect(moveRect({ x: 10, y: 10, w: 50, h: 40 }, 5, 7, 1)).toEqual({
			x: 15,
			y: 17,
			w: 50,
			h: 40
		});
	});

	it('snaps the translated origin to the grid', () => {
		expect(moveRect({ x: 10, y: 10, w: 50, h: 40 }, 3, 3, 8)).toEqual({
			x: 16,
			y: 16,
			w: 50,
			h: 40
		});
	});
});
