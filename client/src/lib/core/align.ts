// Pure alignment-snapping geometry for the editor: nudge a dragged rect so its
// edges/centers align with nearby peers, and report the guide lines to draw. No
// Svelte/Tauri; unit-tested.

import type { Rect } from './layout';

export type SnapResult = { rect: Rect; guideXs: number[]; guideYs: number[] };

type Best = { delta: number; guide: number } | null;

function consider(best: Best, target: number, moving: number): Best {
	const delta = target - moving;
	if (best === null || Math.abs(delta) < Math.abs(best.delta)) {
		return { delta, guide: target };
	}
	return best;
}

/**
 * Snap `rect` to `peers` within `threshold` px. Compares the moving rect's left /
 * centre / right against each peer's left / centre / right (and likewise vertically),
 * snapping to the single closest match per axis. Returns the adjusted rect plus the
 * x/y of any guide line to draw. Preserves width/height.
 */
export function snapRectToPeers(rect: Rect, peers: Rect[], threshold: number): SnapResult {
	const { w, h } = rect;
	const movingX = [rect.x, rect.x + w / 2, rect.x + w];
	const movingY = [rect.y, rect.y + h / 2, rect.y + h];

	let bestX: Best = null;
	let bestY: Best = null;

	for (const p of peers) {
		const peerX = [p.x, p.x + p.w / 2, p.x + p.w];
		const peerY = [p.y, p.y + p.h / 2, p.y + p.h];
		for (const m of movingX) {
			for (const t of peerX) {
				if (Math.abs(t - m) <= threshold) bestX = consider(bestX, t, m);
			}
		}
		for (const m of movingY) {
			for (const t of peerY) {
				if (Math.abs(t - m) <= threshold) bestY = consider(bestY, t, m);
			}
		}
	}

	let { x, y } = rect;
	const guideXs: number[] = [];
	const guideYs: number[] = [];
	if (bestX) {
		x += bestX.delta;
		guideXs.push(bestX.guide);
	}
	if (bestY) {
		y += bestY.delta;
		guideYs.push(bestY.guide);
	}

	return { rect: { x, y, w, h }, guideXs, guideYs };
}
