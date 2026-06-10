// Pure presentation seam for the studio's monitor-switcher labels — kept out of overlay.ts (the Tauri
// adapter) so it's unit-testable without a window. Composes one dropdown option label from the GDI
// device tag (DISPLAYn), the optional friendly/EDID model name, and the geometry.

/** The studio monitor-switcher option label, in the chosen "device tag + name" form:
 *  `DISPLAY1 — Dell U2720Q (primary) · 2560×1440 @ 0,0`. The friendly name is appended after the device
 *  tag with an em-dash; when it's blank (unknown / non-Windows) the tag stands alone. */
export function monitorOptionLabel(opts: {
	device: string;
	friendly: string;
	isPrimary: boolean;
	w: number;
	h: number;
	x: number;
	y: number;
}): string {
	const { device, friendly, isPrimary, w, h, x, y } = opts;
	const named = friendly ? `${device} — ${friendly}` : device;
	return `${named}${isPrimary ? ' (primary)' : ''} · ${w}×${h} @ ${x},${y}`;
}

// Natural-ordering collator so DISPLAY2 sorts before DISPLAY10 (plain string compare puts 10 first).
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Sort the studio's monitor-switcher options: the primary ('default') first, then the rest in
 *  natural device-tag order (DISPLAY1 < DISPLAY2 < DISPLAY10) — `availableMonitors()` returns an
 *  arbitrary enumeration order, so an unsorted dropdown shuffles between sessions. Pure. */
export function compareMonitorOptions(
	a: { key: string; name: string },
	b: { key: string; name: string }
): number {
	if (a.key === 'default') return b.key === 'default' ? 0 : -1;
	if (b.key === 'default') return 1;
	return natural.compare(a.name, b.name);
}
