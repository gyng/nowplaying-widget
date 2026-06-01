// Outer-ring adapter: make app windows monitor-filling overlays, toggle
// whole-window click-through, and (on the primary) spawn one overlay per other
// monitor. Tauri window API stays at this edge.
import {
	availableMonitors,
	currentMonitor,
	getCurrentWindow,
	PhysicalPosition,
	PhysicalSize
} from '@tauri-apps/api/window';
import { getAllWebviewWindows, WebviewWindow } from '@tauri-apps/api/webviewWindow';

/** This window's monitor key: the `?monitor=<i>` param on secondary overlays, or
 * null on the primary (main) window. */
export function monitorParam(): string | null {
	return new URLSearchParams(window.location.search).get('monitor');
}

/** Size and position the window to exactly cover its current monitor. */
export async function fillCurrentMonitor(): Promise<void> {
	const monitor = await currentMonitor();
	if (!monitor) return;
	const win = getCurrentWindow();
	await win.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
	await win.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
}

/** Whole-window click-through: true = clicks pass through (passive overlay). */
export async function setClickThrough(enabled: boolean): Promise<void> {
	await getCurrentWindow().setIgnoreCursorEvents(enabled);
}

/** Primary window only: open a click-through overlay on every other monitor,
 * each carrying its monitor index as `?monitor=<i>`. Idempotent. */
export async function spawnSecondaryOverlays(): Promise<void> {
	const [monitors, current, existing] = await Promise.all([
		availableMonitors(),
		currentMonitor(),
		getAllWebviewWindows()
	]);
	const labels = new Set(existing.map((w) => w.label));

	for (let i = 0; i < monitors.length; i++) {
		const m = monitors[i];
		// Skip the monitor the primary window already covers.
		if (current && m.position.x === current.position.x && m.position.y === current.position.y) {
			continue;
		}
		const label = `overlay-${i}`;
		if (labels.has(label)) continue;

		const w = new WebviewWindow(label, {
			url: `/?monitor=${i}`,
			transparent: true,
			decorations: false,
			alwaysOnTop: true,
			skipTaskbar: true,
			focus: false,
			visible: false
		});
		// Constructor sizes are logical; place precisely in physical px, then show.
		w.once('tauri://created', async () => {
			try {
				await w.setPosition(new PhysicalPosition(m.position.x, m.position.y));
				await w.setSize(new PhysicalSize(m.size.width, m.size.height));
				await w.setIgnoreCursorEvents(true);
				await w.show();
			} catch (err) {
				console.warn('overlay window setup failed', label, err);
			}
		});
		w.once('tauri://error', (err) => console.warn('overlay window error', label, err));
	}
}
