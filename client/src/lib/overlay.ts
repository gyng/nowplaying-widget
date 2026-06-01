// Outer-ring adapter: make the app window a monitor-filling overlay and toggle
// whole-window click-through. Tauri window API stays at this edge.
import {
	currentMonitor,
	getCurrentWindow,
	PhysicalPosition,
	PhysicalSize
} from '@tauri-apps/api/window';

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
