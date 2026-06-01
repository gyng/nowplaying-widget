// Pure presentation math for the radial gauge, extracted so it is unit-testable
// without rendering SVG (AGENTS.md §4).

/** Clamp `value` to [min, max] and return its 0..1 fraction. Null/empty range → 0. */
export function gaugeFraction(value: number | null, min: number, max: number): number {
	if (value === null || max <= min) return 0;
	return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
