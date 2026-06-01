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

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Resize a rect by dragging `handle` by (dx, dy). Only the moved edges snap;
 * width/height are clamped to `min`. */
export function resizeRect(
	rect: Rect,
	handle: ResizeHandle,
	dx: number,
	dy: number,
	grid = 1,
	min = 16
): Rect {
	let left = rect.x;
	let top = rect.y;
	let right = rect.x + rect.w;
	let bottom = rect.y + rect.h;

	if (handle.includes('e')) right = snap(right + dx, grid);
	if (handle.includes('w')) left = snap(left + dx, grid);
	if (handle.includes('s')) bottom = snap(bottom + dy, grid);
	if (handle.includes('n')) top = snap(top + dy, grid);

	let w = right - left;
	let h = bottom - top;
	if (w < min) {
		if (handle.includes('w')) left = right - min;
		w = min;
	}
	if (h < min) {
		if (handle.includes('n')) top = bottom - min;
		h = min;
	}

	return { x: left, y: top, w, h };
}
