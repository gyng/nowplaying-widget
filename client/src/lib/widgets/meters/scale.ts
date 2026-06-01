// Pure value→fraction scaling shared by fill-style meters (gauge, bar). Extracted
// so it is unit-testable without rendering (AGENTS.md §4).

/** Clamp `value` to [min, max] and return its 0..1 fraction. Null/degenerate → 0. */
export function fraction(value: number | null, min: number, max: number): number {
	if (value === null || max <= min) return 0;
	return Math.min(1, Math.max(0, (value - min) / (max - min)));
}
