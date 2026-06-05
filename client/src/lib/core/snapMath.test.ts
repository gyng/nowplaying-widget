import { describe, it, expect } from 'vitest';
import type { Rect } from './layout';
import { frameMargins, computeSnapRect } from './snapMath';

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

describe('frameMargins', () => {
	it('returns zero insets when frameBounds is null', () => {
		expect(frameMargins(r(0, 0, 100, 100), null)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
	});

	it('measures the invisible border as the window-rect-minus-frame delta, top forced to 0', () => {
		// Typical modern window: 7px invisible border L/R/B, ~0 at the top.
		const win = r(0, 0, 814, 607);
		const frame = r(7, 0, 800, 600); // visible frame inset 7px L/R, 7px at the bottom
		expect(frameMargins(win, frame)).toEqual({ left: 7, right: 7, top: 0, bottom: 7 });
	});

	it('clamps negative deltas to 0 (classic theme / DWM off / frame larger than window)', () => {
		const win = r(10, 10, 100, 100);
		const frame = r(0, 0, 200, 200); // frame bigger than window → all deltas negative
		expect(frameMargins(win, frame)).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
	});

	it('treats an implausibly large margin as a bad read and clamps it to 0', () => {
		// A window measured mid open/restore animation: left edges disagree by ~100px (frame far right
		// of the window left) while right edges align — a bogus border that must not be compensated.
		const win = r(0, 0, 1920, 1000);
		const frame = r(102, 0, 1818, 993); // left delta 102 (bogus), right 0, bottom 7
		expect(frameMargins(win, frame)).toEqual({ left: 0, right: 0, top: 0, bottom: 7 });
	});
});

describe('computeSnapRect', () => {
	it('returns the zone unchanged when there is no invisible border', () => {
		const zone = r(100, 200, 800, 600);
		expect(computeSnapRect(zone, r(0, 0, 800, 600), null)).toEqual(zone);
	});

	it('expands the target by L/R/B margins so the VISIBLE frame fills the zone', () => {
		const zone = r(100, 200, 800, 600);
		const win = r(0, 0, 814, 607);
		const frame = r(7, 0, 800, 600); // 7px L/R/B invisible border
		// Visible frame should land exactly on the zone: x shifts left by 7, width grows by 14,
		// height grows by 7 at the bottom, top is untouched.
		expect(computeSnapRect(zone, win, frame)).toEqual(r(93, 200, 814, 607));
	});

	it('never compensates the top edge (y stays at the zone top)', () => {
		const zone = r(0, 50, 400, 300);
		const win = r(0, 0, 414, 357);
		const frame = r(7, 7, 400, 343); // pretend there IS a 7px top inset — must be ignored
		const out = computeSnapRect(zone, win, frame);
		expect(out.y).toBe(50); // top not shifted up by 7
	});

	it('clamps the result inside the work-area bounds when margin overshoot would run off-screen', () => {
		const bounds = r(0, 0, 1920, 1080);
		const zone = r(0, 0, 960, 1080); // left-half zone flush to the screen edge
		const win = r(0, 0, 974, 1087);
		const frame = r(7, 0, 960, 1080); // 7px border → snap x would be -7 (off-screen)
		const out = computeSnapRect(zone, win, frame, bounds);
		expect(out.x).toBeGreaterThanOrEqual(0);
		expect(out.y).toBeGreaterThanOrEqual(0);
		expect(out.x + out.w).toBeLessThanOrEqual(bounds.x + bounds.w);
	});

	it('rounds fractional coordinates to whole pixels', () => {
		const out = computeSnapRect(r(0.4, 0.6, 100.5, 200.5), r(0, 0, 100, 200), null);
		expect(Number.isInteger(out.x)).toBe(true);
		expect(Number.isInteger(out.w)).toBe(true);
	});
});
