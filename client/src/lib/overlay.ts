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
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { Rect } from './core/layout';
import { monitorHasWidgets } from './core/layoutTree';
import { parseLayoutAny } from './core/migration';

/** The set of saved-layout monitor keys that hold at least one widget (so an overlay there would
 * render something). Keys: 'default' (primary) or the monitor index, matching studioMonitorOptions.
 * Empty/missing layouts and a parse error yield an empty set — nothing gets an overlay. */
async function populatedMonitorKeys(): Promise<Set<string>> {
	const keys = new Set<string>();
	try {
		const raw = await invoke<string | null>('load_layout');
		const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
		const layout = obj ? parseLayoutAny(obj) : null;
		if (layout) {
			for (const [k, mon] of Object.entries(layout.monitors)) {
				if (monitorHasWidgets(mon)) keys.add(k);
			}
		}
	} catch (err) {
		console.warn('populatedMonitorKeys: load_layout failed', err);
	}
	return keys;
}

/** Show or hide the primary MAIN window. Used to drop the primary overlay when its layout
 * (`default`) is empty — an empty transparent overlay still occupies the monitor. */
export async function setMainWindowVisible(visible: boolean): Promise<void> {
	try {
		const win = getCurrentWindow();
		if (visible) await win.show();
		else await win.hide();
	} catch (err) {
		console.warn('setMainWindowVisible failed', err);
	}
}

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
	// Re-assert borderless AFTER the resize: on Windows an undecorated window keeps a thin
	// accent-coloured border (tauri-apps/discussions/9469), and setSize can revive it even when
	// the config has shadow:false. Also force decorations off — the window-state plugin can
	// restore a stale saved `decorations:true` at startup, which only this (or the Rust-side
	// StateFlags exclusion) undoes.
	try {
		await win.setDecorations(false);
		await win.setShadow(false);
	} catch (err) {
		console.warn('setDecorations/setShadow failed', err);
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

// ---- sacks: shareable widget+theme bundles in a `sacks/` folder (Rust read/write, no picker) ----

/** The names of saved sacks (file stems of `sacks/*.sack.json`). */
export async function listSacks(): Promise<string[]> {
	try {
		return await invoke<string[]>('list_sacks');
	} catch (err) {
		console.warn('list_sacks failed', err);
		return [];
	}
}

/** The raw JSON of sack `name`, or null if it doesn't exist / fails to read. */
export async function readSack(name: string): Promise<string | null> {
	try {
		return await invoke<string | null>('read_sack', { name });
	} catch (err) {
		console.warn('read_sack failed', err);
		return null;
	}
}

/** Write sack `name` with the given JSON; returns the absolute path written (or null on failure). */
export async function writeSack(name: string, contents: string): Promise<string | null> {
	try {
		return await invoke<string>('write_sack', { name, contents });
	} catch (err) {
		console.warn('write_sack failed', err);
		return null;
	}
}

/** Open this window's webview devtools/inspector (CSS development). Backed by a Rust command
 * since the JS API doesn't expose it; relies on the `devtools` Cargo feature. */
export async function openDevtools(): Promise<void> {
	try {
		await invoke('open_devtools');
	} catch (err) {
		console.warn('open_devtools failed', err);
	}
}

type SystemFont = { name: string; fontName: string; path: string };
const ensuredFonts = new Set<string>();
const normFont = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Make an installed font usable in the webview by `@font-face`-ing its file. Chromium's sandbox
 * won't render a PER-USER-installed font by name, so we ask the backend (fontdb) for the file path
 * and load it via the asset protocol. Matches the family OR PostScript name, normalized (so a
 * spaced family resolves its spaceless PostScript face). Idempotent per window. */
export async function ensureFont(family: string): Promise<void> {
	if (ensuredFonts.has(family)) return;
	ensuredFonts.add(family);
	try {
		const want = normFont(family);
		const fonts = await invoke<SystemFont[]>('system_fonts');
		const match = fonts.find((f) => normFont(f.name) === want || normFont(f.fontName) === want);
		if (!match) {
			console.warn(`ensureFont: "${family}" not found among installed fonts`);
			ensuredFonts.delete(family); // allow a retry later
			return;
		}
		const fmt = match.path.toLowerCase().endsWith('.otf') ? 'opentype' : 'truetype';
		const style = document.createElement('style');
		style.dataset.font = family;
		style.textContent = `@font-face { font-family: '${family}'; src: url('${convertFileSrc(
			match.path
		)}') format('${fmt}'); font-display: swap; }`;
		document.head.appendChild(style);
	} catch (err) {
		console.warn('ensureFont failed', err);
		ensuredFonts.delete(family);
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

/** Copy text to the clipboard. Tries the async Clipboard API first, then falls back to a hidden
 * textarea + execCommand('copy') for webviews where the async API is unavailable/denied. Returns
 * whether the copy succeeded. */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
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

/** Primary window only: reconcile per-monitor overlays against the saved layout. A NON-primary
 * monitor gets a click-through overlay (carrying its index as `?monitor=<i>`) only if its layout
 * has widgets; an overlay whose monitor became empty is closed. Idempotent — safe to re-run on
 * every layout change. The primary monitor is the main window itself (handled separately). */
export async function reconcileOverlays(): Promise<void> {
	const [monitors, primary, existing, populated] = await Promise.all([
		availableMonitors(),
		primaryMonitor(),
		getAllWebviewWindows(),
		populatedMonitorKeys()
	]);
	const byLabel = new Map(existing.map((w) => [w.label, w]));

	for (let i = 0; i < monitors.length; i++) {
		const m = monitors[i];
		// Skip the primary monitor — the main window covers it and renders the `default` key.
		if (primary && m.position.x === primary.position.x && m.position.y === primary.position.y) {
			continue;
		}
		const label = `overlay-${i}`;
		const have = byLabel.get(label);
		const want = populated.has(String(i));
		// Close an overlay whose monitor no longer has any widgets.
		if (!want) {
			if (have) await have.close().catch((err) => console.warn('close overlay failed', label, err));
			continue;
		}
		if (have) continue; // already open

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
				// Re-assert after the resize (see fillPrimaryMonitor) so no border/title bar
				// remains — the window-state plugin can restore a stale decorations:true.
				await w.setDecorations(false);
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
