// Landing-zone interchange types + hit-testing. Zones are authored as `zone` WIDGETS (widgets.json,
// core/widget.ts meta + meters/Zone.tsx), not a separate top-level file — this module is just the
// small shared shape the snap/match logic passes around. No Tauri/React; unit-tested.

import type { Rect } from './layout';

/** Optional rule attaching a window to this zone for on-demand auto-arrange ("position if found").
 * `className`/`title` are globs (see windowMatch.ts); `exe` is matched on basename. Field names match
 * `ZoneRule` (windowMatch.ts) so a match spreads into a rule without an adapter. */
export type ZoneMatch = { exe?: string; className?: string; title?: string };

/** A landing zone in PHYSICAL screen px (the unit snap_window expects): an id, the target rect, and
 * an optional match rule. Derived from a `zone` widget by the overlay (DragSnapLayer). */
export type Zone = { id: string; rect: Rect; match?: ZoneMatch };

/** Point-in-rect, origin inclusive / far edge exclusive — same convention as the Rust
 * `ScreenRect::contains` (clickthrough.rs) so hit-testing agrees on both sides of the bridge. */
function contains(rect: Rect, px: number, py: number): boolean {
	return px >= rect.x && px < rect.x + rect.w && py >= rect.y && py < rect.y + rect.h;
}

/**
 * The id of the zone under (`px`, `py`), or null if none. When zones overlap, the LAST one wins
 * (later in the array = drawn on top). Physical px.
 */
export function hitTestZone(zones: Zone[], px: number, py: number): string | null {
	let hit: string | null = null;
	for (const z of zones) {
		if (contains(z.rect, px, py)) hit = z.id;
	}
	return hit;
}
