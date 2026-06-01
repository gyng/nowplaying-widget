// Pure geometry helpers for the editor (snap-to-grid, drag). No Svelte/Tauri;
// unit-tested and reused as-is by a future React port.

import type { Rect } from './layout';

/** Round `value` to the nearest multiple of `grid` (grid <= 1 → nearest integer). */
export function snap(value: number, grid: number): number {
	return grid > 1 ? Math.round(value / grid) * grid : Math.round(value);
}

/** Translate a rect by (dx, dy), snapping the new origin to `grid`. */
export function moveRect(rect: Rect, dx: number, dy: number, grid = 1): Rect {
	return { ...rect, x: snap(rect.x + dx, grid), y: snap(rect.y + dy, grid) };
}
