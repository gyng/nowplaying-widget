// Pure monitor-key seam, kept out of overlay.ts (the Tauri adapter) so it's unit-testable without
// a window — same split as monitorLabel.ts. The stable device key is what layouts, overlay window
// labels (`overlay-<key>`), and the studio's monitor switcher all share.

/** A monitor's STABLE layout key: the GDI device tag ('DISPLAY3'), not the `availableMonitors()`
 * enumeration index — the index reshuffles across reboots/hot-plugs, which put a saved layout on
 * the wrong physical monitor. Falls back to a position-independent `m<i>` when the platform gives
 * no device name (plain browser / tests). The primary monitor's key stays 'default' (callers). */
export function monitorDeviceKey(name: string | null | undefined, index: number): string {
	const tag = (name ?? '').replace(/^[\\.?]+/, '').trim();
	return tag || `m${index}`;
}

/** The monitor in `monitors` whose stable device key is `key`, or null when none matches (e.g. the
 * monitor was unplugged). Index-aware so the `m<i>` fallback keys keep matching on platforms with
 * no device names. */
export function monitorByKey<T extends { name: string | null }>(
	monitors: T[],
	key: string
): T | null {
	const i = monitors.findIndex((m, idx) => monitorDeviceKey(m.name, idx) === key);
	return i >= 0 ? monitors[i] : null;
}
