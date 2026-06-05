// Pure helpers for the live drag-to-zone overlay (MVP2). No Tauri/React — unit-tested directly; the
// DragSnapLayer wires Tauri events/polling around these. The "armed modifier" rule (locked decision):
// snapping engages only while Shift is held during a foreign-window drag.

import type { Rect } from './layout';
import type { Zone } from './zones';
import { hitTestZone } from './zones';

/** Live pointer state during a drag — cursor in PHYSICAL px + the arming modifier. Mirrors the Rust
 * `PointerState` (windowmgr.rs) 1:1. */
export type Pointer = { x: number; y: number; shift: boolean };

/** The zone the pointer is over WHEN ARMED (Shift held), else null. Not armed → null (no highlight,
 * no snap), so an ordinary drag is never hijacked. `zones` carry PHYSICAL rects. */
export function armedZone(zones: Zone[], p: Pointer): Zone | null {
	if (!p.shift) return null;
	const id = hitTestZone(zones, p.x, p.y);
	return id ? zones.find((z) => z.id === id) ?? null : null;
}

/** A zone widget's overlay-LOCAL logical-px rect (its `unit.rect`) expressed in PHYSICAL global px —
 * origin shifted by the monitor's physical position, size scaled by its DPI factor. This is what
 * `snap_window` / pointer hit-testing need (the inverse: snapped rects come back via SetWindowPos). */
export function localToPhysical(
	local: Rect,
	monitorPos: { x: number; y: number },
	scale: number
): Rect {
	return {
		x: monitorPos.x + local.x * scale,
		y: monitorPos.y + local.y * scale,
		w: local.w * scale,
		h: local.h * scale
	};
}
