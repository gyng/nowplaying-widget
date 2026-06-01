import { describe, expect, it } from 'vitest';
import { moveRect, resizeRect, snap } from './geometry';

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

describe('resizeRect', () => {
	const r = { x: 10, y: 10, w: 50, h: 40 };

	it('grows from the east/south edges', () => {
		expect(resizeRect(r, 'se', 5, 7, 1)).toEqual({ x: 10, y: 10, w: 55, h: 47 });
	});

	it('moves the west/north edges inward', () => {
		expect(resizeRect(r, 'nw', 5, 5, 1)).toEqual({ x: 15, y: 15, w: 45, h: 35 });
	});

	it('clamps to the minimum size, keeping the opposite edge fixed', () => {
		expect(resizeRect(r, 'e', -100, 0, 1, 16)).toEqual({ x: 10, y: 10, w: 16, h: 40 });
		expect(resizeRect(r, 'w', 100, 0, 1, 16)).toEqual({ x: 44, y: 10, w: 16, h: 40 });
	});

	it('snaps only the moved edge to the grid', () => {
		expect(resizeRect(r, 'e', 3, 0, 8)).toEqual({ x: 10, y: 10, w: 54, h: 40 });
	});
});
