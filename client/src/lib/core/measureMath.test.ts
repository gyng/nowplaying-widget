import { describe, it, expect } from 'vitest';
import { screenRectToLayout } from './measureMath';

describe('screenRectToLayout', () => {
	it('1:1 (zoom 1, world at origin) passes the rect through, rebased', () => {
		const r = screenRectToLayout(
			{ left: 30, top: 40, width: 100, height: 50 },
			{ left: 0, top: 0 },
			1
		);
		expect(r).toEqual({ x: 30, y: 40, w: 100, h: 50 });
	});

	it('rebases against the world origin', () => {
		const r = screenRectToLayout(
			{ left: 130, top: 240, width: 100, height: 50 },
			{ left: 100, top: 200 },
			1
		);
		expect(r).toEqual({ x: 30, y: 40, w: 100, h: 50 });
	});

	it('divides out the zoom (a 2x-zoomed 200px-wide element is 100 logical px)', () => {
		// world is also zoomed, so its box left is the zoomed origin; child offset / zoom = logical.
		const r = screenRectToLayout(
			{ left: 100 + 60, top: 200 + 80, width: 200, height: 100 },
			{ left: 100, top: 200 },
			2
		);
		expect(r).toEqual({ x: 30, y: 40, w: 100, h: 50 });
	});

	it('treats zoom 0 / NaN as 1 (no divide-by-zero)', () => {
		const r = screenRectToLayout(
			{ left: 0, top: 0, width: 10, height: 10 },
			{ left: 0, top: 0 },
			0
		);
		expect(r).toEqual({ x: 0, y: 0, w: 10, h: 10 });
	});
});
