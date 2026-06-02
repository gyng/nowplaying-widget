// Outer-ring adapter: make app windows monitor-filling overlays, toggle
// whole-window click-through, and (on the primary) spawn one overlay per other
// monitor. Tauri window API stays at this edge.
import {
	availableMonitors,
	currentMonitor,
	getCurrentWindow,
	primaryMonitor,
	PhysicalPosition,
	PhysicalSize
} from '@tauri-apps/api/window';
import { getAllWebviewWindows, WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import type { Rect } from './core/layout';

/** This window's monitor key: the `?monitor=<i>` param on secondary overlays, or
 * null on the primary (main) window. */
export function monitorParam(): string | null {
	return new URLSearchParams(window.location.search).get('monitor');
}

/** The work area (monitor minus taskbar) for this window's monitor, in LOCAL logical px
 * (canvas coords), or null if unavailable. Insets the taskbar so the flow root avoids it
 * (Phase 5b). Backend returns physical px; we rebase to the monitor origin + descale. */
export async function monitorWorkArea(): Promise<Rect | null> {
	try {
		const wa = await invoke<{ x: number; y: number; w: number; h: number }>('current_work_area');
		const monitor = await currentMonitor();
		if (!monitor) return null;
		const s = monitor.scaleFactor;
		return {
			x: (wa.x - monitor.position.x) / s,
			y: (wa.y - monitor.position.y) / s,
			w: wa.w / s,
			h: wa.h / s
		};
	} catch (err) {
		console.warn('current_work_area failed; using full monitor', err);
		return null;
	}
}

/** Size and position the main window to exactly cover the PRIMARY monitor. The main window
 * renders the `default` layout key, and the studio maps `default` → primary, so the launcher
 * must sit on the primary (not wherever it happened to open) or `default` would render on the
 * wrong display. Falls back to the current monitor if the primary can't be resolved. */
export async function fillPrimaryMonitor(): Promise<void> {
	const monitor = (await primaryMonitor()) ?? (await currentMonitor());
	if (!monitor) return;
	const win = getCurrentWindow();
	await win.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
	await win.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
	// Re-assert no shadow AFTER the resize: on Windows an undecorated window keeps a thin
	// accent-coloured border (tauri-apps/discussions/9469), and setSize can revive it even when
	// the config has shadow:false. This is what leaves a line along an edge.
	try {
		await win.setShadow(false);
	} catch (err) {
		console.warn('setShadow failed', err);
	}
}

/** Whole-window click-through: true = clicks pass through (passive overlay). */
export async function setClickThrough(enabled: boolean): Promise<void> {
	await getCurrentWindow().setIgnoreCursorEvents(enabled);
}

/** Theme names available in the config dir's `themes/` folder (Phase 7c). */
export async function listThemes(): Promise<string[]> {
	try {
		return await invoke<string[]>('list_themes');
	} catch (err) {
		console.warn('list_themes failed', err);
		return [];
	}
}

/** The CSS of theme `name` (empty for '(default)' / a missing theme). */
export async function loadThemeCss(name: string): Promise<string> {
	if (!name) return '';
	try {
		return (await invoke<string | null>('load_theme', { name })) ?? '';
	} catch (err) {
		console.warn('load_theme failed', err);
		return '';
	}
}

/** Write theme `name` (a bare stem) → `themes/<name>.css`. Used by the studio theme editor. */
export async function saveThemeCss(name: string, contents: string): Promise<void> {
	try {
		await invoke('save_theme', { name, contents });
	} catch (err) {
		console.warn('save_theme failed', err);
	}
}

/** True when this window is the studio (a normal app window for the designers, 5s). */
export function isStudioWindow(): boolean {
	try {
		return getCurrentWindow().label === 'studio';
	} catch {
		return false;
	}
}

/** Monitor options for the studio's monitor switcher: each maps to the same per-monitor
 * key the overlays use (the primary monitor → `default`, others → their index). Lets the
 * studio edit any monitor's layout from one window (5s multi-monitor). */
export async function studioMonitorOptions(): Promise<
	{ key: string; label: string; name: string; w: number; h: number }[]
> {
	const [all, primary] = await Promise.all([availableMonitors(), primaryMonitor()]);
	return all.map((m, i) => {
		const isPrimary =
			!!primary && m.position.x === primary.position.x && m.position.y === primary.position.y;
		// Logical dimensions (physical / DPI scale) so the studio preview matches the overlay's
		// logical coordinate space; the zoom-to-fit then maps that onto the editor stage.
		const w = Math.round(m.size.width / m.scaleFactor);
		const h = Math.round(m.size.height / m.scaleFactor);
		// Identify by the OS device name (e.g. "\\.\DISPLAY3" → "DISPLAY3") + the monitor's
		// virtual-desktop position, NOT the arbitrary enumeration index — so the label names the
		// PHYSICAL monitor the layout drives (the DISPLAYn number usually matches Windows' own).
		const name = (m.name ?? '').replace(/^[\\.?]+/, '') || `Monitor ${i + 1}`;
		return {
			key: isPrimary ? 'default' : String(i),
			label: `${name}${isPrimary ? ' (primary)' : ''} · ${w}×${h} @ ${m.position.x},${
				m.position.y
			}`,
			name,
			w,
			h
		};
	});
}

/** Open (or focus) the studio window — a normal, decorated, taskbar-present app window
 * that edits the same layout the overlays render (synced via widgets.json + live reload). */
export async function openStudio(): Promise<void> {
	const existing = (await getAllWebviewWindows()).find((w) => w.label === 'studio');
	if (existing) {
		await existing.setFocus();
		return;
	}
	const w = new WebviewWindow('studio', {
		url: '/',
		title: 'WidgetSack Studio',
		width: 980,
		height: 680,
		resizable: true
	});
	w.once('tauri://error', (err) => console.warn('studio window error', err));
}

/** Primary window only: open a click-through overlay on every NON-primary monitor,
 * each carrying its monitor index as `?monitor=<i>`. Idempotent. The primary monitor is
 * covered by the main window itself (the `default` key), so it is skipped here. */
export async function spawnSecondaryOverlays(): Promise<void> {
	const [monitors, primary, existing] = await Promise.all([
		availableMonitors(),
		primaryMonitor(),
		getAllWebviewWindows()
	]);
	const labels = new Set(existing.map((w) => w.label));

	for (let i = 0; i < monitors.length; i++) {
		const m = monitors[i];
		// Skip the primary monitor — the main window covers it and renders the `default` key.
		if (primary && m.position.x === primary.position.x && m.position.y === primary.position.y) {
			continue;
		}
		const label = `overlay-${i}`;
		if (labels.has(label)) continue;

		const w = new WebviewWindow(label, {
			url: `/?monitor=${i}`,
			transparent: true,
			decorations: false,
			// No window shadow: on Windows an undecorated window otherwise keeps a thin
			// accent-coloured border line (tauri-apps/discussions/9469).
			shadow: false,
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
				// Re-assert after the resize (see fillPrimaryMonitor) so no border line remains.
				await w.setShadow(false);
				await w.setIgnoreCursorEvents(true);
				await w.show();
			} catch (err) {
				console.warn('overlay window setup failed', label, err);
			}
		});
		w.once('tauri://error', (err) => console.warn('overlay window error', label, err));
	}
}

/**
 * Tell the backend which of this window's widgets should catch clicks in passive mode,
 * as physical screen rects. Each item carries its SOLVED logical rect (flow widgets are
 * not at their unit.rect). In edit mode the whole window is interactive, so send none.
 */
export async function syncInteractiveRects(
	items: { rect: Rect; interactive?: boolean }[],
	editMode: boolean
): Promise<void> {
	const win = getCurrentWindow();
	const label = win.label;
	if (editMode) {
		await invoke('set_interactive_rects', { label, rects: [] });
		return;
	}
	const [scale, pos] = await Promise.all([win.scaleFactor(), win.outerPosition()]);
	const rects = items
		.filter((i) => i.interactive)
		.map((i) => ({
			x: pos.x + i.rect.x * scale,
			y: pos.y + i.rect.y * scale,
			w: i.rect.w * scale,
			h: i.rect.h * scale
		}));
	await invoke('set_interactive_rects', { label, rects });
}
