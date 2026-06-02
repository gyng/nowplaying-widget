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

export type Bar = { x: number; y: number; w: number; h: number };

/** Map a history buffer to histogram bars rising from the baseline. Unlike the line (which
 * scales between the data min and max), bars rise from `min ?? 0` so heights read absolutely;
 * `gap` (0..1) is the fractional spacing between bars. Used by the sparkline's histogram mode. */
export function sparklineBars(
	history: number[],
	width: number,
	height: number,
	min: number | null = null,
	max: number | null = null,
	gap = 0.2
): Bar[] {
	if (history.length === 0) return [];
	const lo = min ?? 0;
	const hi = max ?? Math.max(...history);
	const span = hi - lo || 1;
	const slot = width / history.length;
	const w = slot * (1 - gap);
	return history.map((v, i) => {
		const frac = Math.max(0, Math.min(1, (v - lo) / span));
		const barH = frac * height;
		return { x: i * slot + (slot - w) / 2, y: height - barH, w, h: barH };
	});
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
