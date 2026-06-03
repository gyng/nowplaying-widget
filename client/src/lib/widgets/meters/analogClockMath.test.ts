import { describe, it, expect } from 'vitest';
import { handAngles, updatePeriod } from './analogClockMath';

const at = (h: number, m: number, s: number) => new Date(2020, 0, 1, h, m, s);

describe('handAngles', () => {
	it('is all-zero at 12:00:00', () => {
		expect(handAngles(at(12, 0, 0))).toEqual({ hour: 0, minute: 0, second: 0 });
	});

	it('points the hour hand straight down at 6:00', () => {
		expect(handAngles(at(6, 0, 0)).hour).toBe(180);
	});

	it('advances the hour hand with the minutes (3:30 → 105°)', () => {
		expect(handAngles(at(3, 30, 0)).hour).toBe(105); // (3 + 30/60) * 30
	});

	it('advances the minute hand with the seconds and ticks the second hand', () => {
		const a = handAngles(at(0, 0, 30));
		expect(a.second).toBe(180);
		expect(a.minute).toBeCloseTo(3, 5); // (0 + 30/60) * 6
	});

	it('wraps 24h to the 12h face', () => {
		expect(handAngles(at(15, 0, 0)).hour).toBe(90); // 15 → 3 o'clock
	});

	it('advances the second hand with sub-second precision (for a smooth sweep)', () => {
		const a = handAngles(new Date(2020, 0, 1, 0, 0, 30, 500)); // 30.5s
		expect(a.second).toBeCloseTo(183, 5); // 30.5 * 6
	});
});

describe('updatePeriod', () => {
	it('uses the configured rate, floored at one frame (16ms)', () => {
		expect(updatePeriod(250)).toBe(250); // smooth-ish
		expect(updatePeriod(16)).toBe(16);
		expect(updatePeriod(5)).toBe(16); // clamped up
	});

	it('falls back to 1000ms for missing / zero / non-finite values', () => {
		expect(updatePeriod(undefined)).toBe(1000);
		expect(updatePeriod(0)).toBe(1000);
		expect(updatePeriod(NaN)).toBe(1000);
	});
});
