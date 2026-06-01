// Pure sparkline geometry, extracted so it is unit-testable without SVG
// (AGENTS.md §4).

export type Point = [number, number];

/** Resolve the value range, falling back to data bounds where min/max aren't pinned. */
export function sparklineRange(
	history: number[],
	min: number | null,
	max: number | null
): [number, number] {
	const lo = min ?? Math.min(...history);
	const hi = max ?? Math.max(...history);
	return [lo, hi];
}

/** Map a history buffer to points within [0,width] × [0,height] (y inverted). */
export function sparklinePoints(
	history: number[],
	width: number,
	height: number,
	min: number | null = null,
	max: number | null = null
): Point[] {
	if (history.length === 0) return [];
	const [lo, hi] = sparklineRange(history, min, max);
	const span = hi - lo;
	const stepX = history.length > 1 ? width / (history.length - 1) : 0;
	return history.map((v, i) => {
		const frac = span === 0 ? 0.5 : (v - lo) / span;
		return [i * stepX, height - frac * height];
	});
}
