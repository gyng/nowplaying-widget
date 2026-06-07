import { describe, it, expect } from 'vitest';
import { coreCellRects } from './cpuCoresMath';

describe('coreCellRects', () => {
	it('lays out one row per default (cols = count), splitting width by the gap', () => {
		const cells = coreCellRects(4, 4, 100, 32, 4);
		expect(cells).toHaveLength(4);
		// 4 cols, 3 gaps of 4 = 12 → (100-12)/4 = 22 wide; single row → full height
		expect(cells[0]).toEqual({ x: 0, y: 0, w: 22, h: 32 });
		expect(cells[1].x).toBe(26); // 22 + 4 gap
		expect(cells[3].x).toBe(78);
		expect(cells.every((c) => c.h === 32)).toBe(true);
	});

	it('wraps into rows when cols < count', () => {
		const cells = coreCellRects(4, 2, 100, 50, 0);
		// 2 cols × 2 rows, no gap → 50×25 cells
		expect(cells[0]).toEqual({ x: 0, y: 0, w: 50, h: 25 });
		expect(cells[1]).toEqual({ x: 50, y: 0, w: 50, h: 25 });
		expect(cells[2]).toEqual({ x: 0, y: 25, w: 50, h: 25 });
		expect(cells[3]).toEqual({ x: 50, y: 25, w: 50, h: 25 });
	});

	it('clamps cols to [1, count] and never returns negative sizes', () => {
		expect(coreCellRects(3, 0, 90, 30, 0)).toHaveLength(3); // cols 0 → 1 column, 3 rows
		expect(coreCellRects(3, 99, 90, 30, 0)).toHaveLength(3); // cols > count → count columns
		// gap larger than the area: width clamps to 0, not negative
		const tight = coreCellRects(2, 2, 2, 10, 100);
		expect(tight.every((c) => c.w >= 0 && c.h >= 0)).toBe(true);
	});

	it('returns nothing for no cores', () => {
		expect(coreCellRects(0, 4, 100, 32, 4)).toEqual([]);
	});
});
