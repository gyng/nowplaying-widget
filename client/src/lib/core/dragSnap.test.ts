import { describe, it, expect } from 'vitest';
import type { Rect } from './layout';
import type { Zone } from './zones';
import { armedZone, localToPhysical } from './dragSnap';

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const zone = (id: string, rect: Rect): Zone => ({ id, rect });

describe('armedZone', () => {
	const zones = [zone('left', r(0, 0, 100, 200)), zone('right', r(100, 0, 100, 200))];

	it('returns null when not armed (Shift up), even over a zone', () => {
		expect(armedZone(zones, { x: 50, y: 50, shift: false })).toBeNull();
	});

	it('returns the zone under the pointer when armed', () => {
		expect(armedZone(zones, { x: 50, y: 50, shift: true })?.id).toBe('left');
		expect(armedZone(zones, { x: 150, y: 50, shift: true })?.id).toBe('right');
	});

	it('returns null when armed but over no zone', () => {
		expect(armedZone(zones, { x: 500, y: 50, shift: true })).toBeNull();
		expect(armedZone([], { x: 50, y: 50, shift: true })).toBeNull();
	});
});

describe('localToPhysical', () => {
	it('shifts by the monitor origin at scale 1', () => {
		// A zone widget at local (100,100,800,600) on a monitor at physical origin (1920,0).
		expect(localToPhysical(r(100, 100, 800, 600), { x: 1920, y: 0 }, 1)).toEqual(
			r(2020, 100, 800, 600)
		);
	});

	it('scales size + offset by the DPI factor (HiDPI monitor)', () => {
		// Local (200,100,800,600) on a 200% monitor at origin (0,0) → physical (400,200,1600,1200).
		expect(localToPhysical(r(200, 100, 800, 600), { x: 0, y: 0 }, 2)).toEqual(
			r(400, 200, 1600, 1200)
		);
	});
});
