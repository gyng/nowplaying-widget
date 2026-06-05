// Pure clock-hand geometry for the analog clock meter (kept out of the component so it's testable
// without a DOM). Angles are CLOCKWISE degrees from 12 o'clock (0 = straight up), applied as a CSS
// `transform: rotate(angle)` on a hand drawn pointing up. Co-located tests in analogClockMath.test.ts.

export type HandAngles = { hour: number; minute: number; second: number };

/** Hour/minute/second hand angles for `d`. Every hand advances continuously (sub-second precision),
 * so how smooth the motion looks is purely a function of the sample/update rate: a 1000ms tick reads
 * as a per-second step, a fast tick sweeps. */
export function handAngles(d: Date): HandAngles {
	const s = d.getSeconds() + d.getMilliseconds() / 1000;
	const min = d.getMinutes() + s / 60;
	const h = (d.getHours() % 12) + min / 60;
	return {
		hour: h * 30, // 30° per hour
		minute: min * 6, // 6° per minute
		second: s * 6 // 6° per second
	};
}

/** The redraw interval (ms) for a configured `updateMs`: floored at one frame (16ms) so a fast
 * setting stays sane, and falling back to 1000ms for a missing / zero / non-finite value. */
export function updatePeriod(updateMs: number | undefined): number {
	return updateMs && updateMs > 0 ? Math.max(16, updateMs) : 1000;
}
