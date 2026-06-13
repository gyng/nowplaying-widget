import { describe, it, expect } from 'vitest';
import type { Rect } from './layout';
import type { Zone } from './zones';
import type { WindowDescriptor } from './windowMatch';
import { zoneRules, planArrangement } from './arrange';

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const zone = (id: string, rect: Rect, match?: Zone['match']): Zone => ({ id, rect, match });
const win = (hwnd: number, exe: string, className = 'C', title = 'T'): WindowDescriptor => ({
	hwnd,
	exe,
	className,
	title,
	rect: r(0, 0, 100, 100)
});

describe('zoneRules', () => {
	it('keeps only zones with a non-empty match rule, as ZoneRules', () => {
		const zones = [
			zone('m', r(0, 0, 10, 10), { exe: 'spotify.exe' }),
			zone('plain', r(0, 0, 10, 10)),
			zone('empty', r(0, 0, 10, 10), {})
		];
		expect(zoneRules(zones)).toEqual([{ zoneId: 'm', exe: 'spotify.exe' }]);
	});
});

describe('planArrangement', () => {
	const zones = [
		zone('music', r(0, 0, 960, 1080), { exe: 'spotify.exe' }),
		zone('editor', r(960, 0, 960, 1080), { exe: 'code.exe' }),
		zone('unruled', r(0, 0, 100, 100))
	];

	it('plans a snap for each window that matches a zone rule', () => {
		const wins = [
			win(1, 'C:\\x\\Spotify.exe'),
			win(2, 'C:\\y\\Code.exe'),
			win(3, 'C:\\z\\Random.exe') // matches nothing
		];
		expect(planArrangement(zones, wins)).toEqual([
			{ hwnd: 1, zoneId: 'music', rect: r(0, 0, 960, 1080) },
			{ hwnd: 2, zoneId: 'editor', rect: r(960, 0, 960, 1080) }
		]);
	});

	it('returns [] when no zone carries a rule (never moves anything blindly)', () => {
		expect(planArrangement([zone('a', r(0, 0, 10, 10))], [win(1, 'a.exe')])).toEqual([]);
	});

	it('assigns one window per zone — an extra window of the same app is left unplaced', () => {
		// Only one zone matches spotify.exe, so a second Spotify window has no free zone to take and is
		// left where it is (rather than stacking on top of the first in the same zone).
		const wins = [win(1, 'spotify.exe'), win(2, 'spotify.exe')];
		expect(planArrangement(zones, wins)).toEqual([
			{ hwnd: 1, zoneId: 'music', rect: r(0, 0, 960, 1080) }
		]);
	});

	it('spreads multiple windows of one app across every zone that matches it (one each)', () => {
		const twoMusic = [
			zone('musicA', r(0, 0, 960, 1080), { exe: 'spotify.exe' }),
			zone('musicB', r(960, 0, 960, 1080), { exe: 'spotify.exe' })
		];
		const wins = [win(1, 'spotify.exe'), win(2, 'spotify.exe'), win(3, 'spotify.exe')];
		// Two matching zones → the first two windows fill one each (earliest zone first); the third has
		// no free zone left and is skipped.
		expect(planArrangement(twoMusic, wins)).toEqual([
			{ hwnd: 1, zoneId: 'musicA', rect: r(0, 0, 960, 1080) },
			{ hwnd: 2, zoneId: 'musicB', rect: r(960, 0, 960, 1080) }
		]);
	});
});
