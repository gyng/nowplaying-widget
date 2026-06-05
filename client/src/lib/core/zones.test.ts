import { describe, it, expect } from 'vitest';
import type { Rect } from './layout';
import { hitTestZone, type Zone } from './zones';

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const zone = (id: string, rect: Rect): Zone => ({ id, rect });

describe('hitTestZone', () => {
	const zones = [zone('left', r(0, 0, 100, 200)), zone('right', r(100, 0, 100, 200))];

	it('returns the zone id under the point (origin inclusive, far edge exclusive)', () => {
		expect(hitTestZone(zones, 0, 0)).toBe('left'); // top-left corner included
		expect(hitTestZone(zones, 50, 100)).toBe('left');
		expect(hitTestZone(zones, 100, 100)).toBe('right'); // x==100 belongs to 'right', not 'left'
	});

	it('returns null outside every zone', () => {
		expect(hitTestZone(zones, 200, 100)).toBeNull(); // right edge of 'right' excluded
		expect(hitTestZone(zones, 50, 200)).toBeNull(); // bottom edge excluded
		expect(hitTestZone(zones, -1, -1)).toBeNull();
	});

	it('returns the LAST-defined zone when zones overlap (later = on top)', () => {
		const overlapping = [zone('under', r(0, 0, 100, 100)), zone('over', r(0, 0, 100, 100))];
		expect(hitTestZone(overlapping, 50, 50)).toBe('over');
	});

	it('returns null for an empty zone list', () => {
		expect(hitTestZone([], 0, 0)).toBeNull();
	});
});
