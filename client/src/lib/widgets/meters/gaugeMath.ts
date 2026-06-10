// Pure gauge geometry for every Gauge style (arc / circle / pips / needle / linear),
// extracted so it is unit-testable without SVG (AGENTS.md §4). Angles are SVG screen
// degrees: 0° points right (+x) and positive angles turn CLOCKWISE (y grows downward).

export type GaugeDirection = 'arc' | 'ltr' | 'rtl' | 'btt' | 'ttb';
export type Pt = { x: number; y: number };
export type Seg = { x: number; y: number; w: number; h: number };
export type Tick = { x1: number; y1: number; x2: number; y2: number };

/** Clamp a configured sweep (degrees) to [90, 360]; non-finite → the classic 270. */
export function clampSweep(sweep: number): number {
	if (!Number.isFinite(sweep)) return 270;
	return Math.min(360, Math.max(90, sweep));
}

/** Clamp a configured pip count to a sane integer; non-finite → 10. */
export function clampPips(n: number): number {
	if (!Number.isFinite(n)) return 10;
	return Math.min(60, Math.max(1, Math.round(n)));
}

/** Rotation (degrees) that centres the arc's gap at the bottom: the arc starts at
 * 90° (straight down) plus half the gap. 270° sweep → the legacy rotate(135). */
export function arcRotation(sweepDeg: number): number {
	return 90 + (360 - sweepDeg) / 2;
}

/** stroke-dasharray for an arc covering `frac` of a `sweepDeg` span on a circle of
 * circumference `c`. Computed as frac × sweepFraction × c (in that order) so the
 * default 270° string is byte-identical to the legacy `frac * 0.75 * c`. */
export function arcDasharray(c: number, sweepDeg: number, frac = 1): string {
	return `${frac * (sweepDeg / 360) * c} ${c}`;
}

/** Needle rotation (degrees): the arc start swept forward by `frac` of the span.
 * frac 0.5 on a 270° dial → 270° (straight up). */
export function needleAngle(frac: number, sweepDeg: number): number {
	return arcRotation(sweepDeg) + frac * sweepDeg;
}

/** Point on the circle centred at (cx, cy) with radius `r` at `angleDeg` (screen degrees). */
export function polar(cx: number, cy: number, r: number, angleDeg: number): Pt {
	const rad = (angleDeg * Math.PI) / 180;
	return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** How many of `n` pips light up at `frac` (nearest-pip rounding, clamped to [0, n]). */
export function pipFilledCount(frac: number, n: number): number {
	return Math.min(n, Math.max(0, Math.round(frac * n)));
}

/** Pip centres along the arc, in fill order (arc start → arc end, endpoints inclusive). */
export function pipArcPositions(
	n: number,
	sweepDeg: number,
	cx: number,
	cy: number,
	r: number
): Pt[] {
	const start = arcRotation(sweepDeg);
	return Array.from({ length: n }, (_, i) =>
		polar(cx, cy, r, start + sweepDeg * (n === 1 ? 0.5 : i / (n - 1)))
	);
}

/** Dot radius for arc pips: a fraction of the spacing along the arc, capped so few pips
 * stay dots (not boulders) and many pips never touch. */
export function pipRadius(n: number, sweepDeg: number, r: number): number {
	const arcLen = (sweepDeg / 360) * 2 * Math.PI * r;
	const spacing = arcLen / Math.max(1, n - 1);
	return Math.min(5, Math.max(1, spacing * 0.35));
}

/** Map a linear direction to its axis + whether the fill starts at the far end of the
 * natural CSS flow (left→right for rows, top→bottom for columns). 'arc' ≡ 'ltr'. */
export function directionAxis(dir: GaugeDirection): { vertical: boolean; reverse: boolean } {
	switch (dir) {
		case 'rtl':
			return { vertical: false, reverse: true };
		case 'ttb':
			return { vertical: true, reverse: false };
		case 'btt':
			return { vertical: true, reverse: true };
		default:
			return { vertical: false, reverse: false };
	}
}

/** Pip rectangles for a linear row/column in a 0..100 box (stretched by the renderer with
 * preserveAspectRatio="none"), in FILL order: the first segment sits where the fill starts
 * (ltr → left, rtl → right, btt → bottom, ttb → top). `gap` is the fraction of each slot
 * left empty (split evenly on both sides). */
export function pipSegments(n: number, dir: GaugeDirection, gap = 0.25): Seg[] {
	const { vertical, reverse } = directionAxis(dir);
	const slot = 100 / n;
	const len = slot * (1 - gap);
	const inset = (slot - len) / 2;
	return Array.from({ length: n }, (_, i) => {
		const pos = (reverse ? n - 1 - i : i) * slot + inset;
		return vertical ? { x: 0, y: pos, w: 100, h: len } : { x: pos, y: 0, w: len, h: 100 };
	});
}

/** How many dial ticks a sweep gets (one per 30°, endpoints inclusive): 270° → 10. */
export function dialTickCount(sweepDeg: number): number {
	return Math.round(sweepDeg / 30) + 1;
}

/** Radial tick segments (rInner → rOuter) spread evenly across the sweep, arc start first. */
export function dialTicks(
	sweepDeg: number,
	count: number,
	cx: number,
	cy: number,
	rInner: number,
	rOuter: number
): Tick[] {
	const start = arcRotation(sweepDeg);
	return Array.from({ length: count }, (_, i) => {
		const angle = start + sweepDeg * (count === 1 ? 0.5 : i / (count - 1));
		const a = polar(cx, cy, rInner, angle);
		const b = polar(cx, cy, rOuter, angle);
		return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
	});
}
