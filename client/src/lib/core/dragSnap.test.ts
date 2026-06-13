import { describe, it, expect } from 'vitest';
import type { Rect, WidgetInstance } from './layout';
import type { Zone } from './zones';
import type { LayoutV2, Leaf } from './layoutTree';
import { armedZone, collectDockedZoneMatches, localToPhysical, matchOf } from './dragSnap';

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

describe('matchOf', () => {
	it('returns undefined when no match field is set', () => {
		expect(matchOf({})).toBeUndefined();
		expect(matchOf({ matchExe: '', matchClass: '   ' })).toBeUndefined();
	});

	it('trims fields and drops blank ones', () => {
		expect(matchOf({ matchExe: ' Spotify.exe ' })).toEqual({
			exe: 'Spotify.exe',
			className: undefined,
			title: undefined
		});
		expect(matchOf({ matchExe: '  ', matchClass: 'Chrome_WidgetWin_1' })).toEqual({
			exe: undefined,
			className: 'Chrome_WidgetWin_1',
			title: undefined
		});
	});
});

describe('collectDockedZoneMatches', () => {
	const zoneUnit = (id: string, config: Record<string, unknown>): WidgetInstance => ({
		id,
		type: 'zone',
		rect: r(0, 0, 10, 10),
		config
	});
	const lf = (unit: WidgetInstance): Leaf => ({ id: unit.id, unit });

	const layout: LayoutV2 = {
		version: 2,
		monitors: {
			default: {
				root: {
					id: 'root',
					kind: 'col',
					children: [
						lf(zoneUnit('docked1', { matchExe: 'notepad.exe' })),
						{ id: 'grid', kind: 'grid', children: [lf(zoneUnit('docked2', {}))] },
						lf({ id: 'clock1', type: 'clock', rect: r(0, 0, 10, 10), config: {} })
					]
				},
				floating: [lf(zoneUnit('floatZone', { matchTitle: '*Gmail*' }))]
			}
		}
	};

	it('collects DOCKED zone widgets (incl. nested in containers), keyed by id → match rule', () => {
		const m = collectDockedZoneMatches(layout, 'default');
		expect([...m.keys()].sort()).toEqual(['docked1', 'docked2']);
		expect(m.get('docked1')).toEqual({
			exe: 'notepad.exe',
			className: undefined,
			title: undefined
		});
		expect(m.get('docked2')).toBeUndefined(); // a docked zone with no rule is still a drag target
	});

	it('excludes floating zones (those carry their own unit.rect) and non-zone widgets', () => {
		const m = collectDockedZoneMatches(layout, 'default');
		expect(m.has('floatZone')).toBe(false);
		expect(m.has('clock1')).toBe(false);
	});

	it('returns an empty map for a null layout or an unknown monitor key', () => {
		expect(collectDockedZoneMatches(null, 'default').size).toBe(0);
		expect(collectDockedZoneMatches(layout, 'DISPLAY9').size).toBe(0);
	});
});
