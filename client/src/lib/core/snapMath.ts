// Pure placement math for the "application landing zone" (FancyZones-style window snapping).
// Given a target zone and the foreign window's geometry, compute the rect to feed SetWindowPos
// so the window's VISIBLE frame fills the zone. No Win32/Tauri/React — unit-tested directly; the
// Rust edge (windowmgr.rs `adjust_for_frame_bounds`) mirrors the margin math so both sides agree.
// NOTE: the optional `bounds` clamp below is TS-only — the Rust twin never clamps; overshoot
// clamping (if a future caller needs it) must happen TS-side before invoking snap_window.
//
// All rects are in PHYSICAL screen pixels (the unit clickthrough.rs already works in). A modern
// top-level window's GetWindowRect INCLUDES an invisible DWM resize border (~7-8px L/R/B at 100%);
// DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS) gives the visible frame. We compensate by
// expanding the target by those margins — left/right/bottom only, never the top (the top has ~1px
// and no invisible border, so subtracting a top margin would misplace the window vertically).

import type { Rect } from './layout';

/** Per-edge invisible-frame margins (px): how far the visible frame sits inside the window rect. */
export type Insets = { left: number; right: number; top: number; bottom: number };

const ZERO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

// The largest plausible DWM invisible border (px). A real border is ~7-8px (≤ ~16 even at 200% DPI);
// a larger computed delta means an inconsistent windowRect/frameBounds read (a window measured mid
// open/restore animation) — treat it as bogus and skip compensation for that edge rather than
// mis-snapping by ~100px. Mirrors MAX_DWM_BORDER in windowmgr.rs.
const MAX_DWM_BORDER = 24;
const clampBorder = (m: number): number => (m >= 0 && m <= MAX_DWM_BORDER ? m : 0);

/**
 * The invisible DWM-border margins for a window: `windowRect` (GetWindowRect) minus `frameBounds`
 * (DWMWA_EXTENDED_FRAME_BOUNDS). `top` is forced to 0 by design (see file header). Out-of-range
 * deltas — negative (classic theme / DWM off, where the rects coincide or the frame is larger) or
 * implausibly large (a bad read) — clamp to 0, so a missing/garbage `frameBounds` (null) yields zero
 * insets and snapping degrades to a plain move.
 */
export function frameMargins(windowRect: Rect, frameBounds: Rect | null): Insets {
	if (!frameBounds) return { ...ZERO_INSETS };
	const left = clampBorder(frameBounds.x - windowRect.x);
	const right = clampBorder(windowRect.x + windowRect.w - (frameBounds.x + frameBounds.w));
	const bottom = clampBorder(windowRect.y + windowRect.h - (frameBounds.y + frameBounds.h));
	return { left, right, top: 0, bottom };
}

/** Clamp `rect` to fit inside `bounds`, preferring to keep the origin and shrinking the size if it
 * would overflow. Used to stop margin overshoot from pushing a snapped window off the work area. */
function clampInside(rect: Rect, bounds: Rect): Rect {
	const x = Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.w - 1));
	const y = Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.h - 1));
	const w = Math.max(1, Math.min(rect.w, bounds.x + bounds.w - x));
	const h = Math.max(1, Math.min(rect.h, bounds.y + bounds.h - y));
	return { x, y, w, h };
}

/**
 * The rect to pass to SetWindowPos so the window's visible frame fills `zone`, compensating for the
 * window's invisible DWM border. `windowRect`/`frameBounds` come from the foreign window as-is; pass
 * `frameBounds = null` to skip compensation (plain move/resize). Optionally clamp the result inside
 * `bounds` (the target monitor work area) so overshoot can't push the window off-screen. Physical px.
 */
export function computeSnapRect(
	zone: Rect,
	windowRect: Rect,
	frameBounds: Rect | null,
	bounds?: Rect
): Rect {
	const m = frameMargins(windowRect, frameBounds);
	const out: Rect = {
		x: Math.round(zone.x - m.left),
		y: Math.round(zone.y - m.top), // m.top is always 0; kept explicit to mirror the Rust seam
		w: Math.round(zone.w + m.left + m.right),
		h: Math.round(zone.h + m.top + m.bottom)
	};
	return bounds ? clampInside(out, bounds) : out;
}
