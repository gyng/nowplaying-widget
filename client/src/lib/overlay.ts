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
import { emit } from '@tauri-apps/api/event';
import type { Rect } from './core/layout';
import type { WindowDescriptor } from './core/windowMatch';
import { monitorHasWidgets } from './core/layoutTree';
import { builtinCss } from './core/builtinThemes';
import { monitorOptionLabel } from './monitorLabel';
import { parseLayoutAny } from './core/migration';
import { readOverlayPrefs, type OverlayLayer } from './widgets/canvas/overlayPrefs';

/** Apply the overlay z-order layer to THIS window: 'top' = always-on-top (default), 'bottom' =
 *  always-on-bottom (below app windows), 'wallpaper' = parented to the desktop WorkerW (on the
 *  wallpaper, behind icons) via the Rust `set_overlay_wallpaper` command. Each overlay window
 *  self-applies — the wallpaper invoke targets the CALLING window, so it must run in that window.
 *  Best-effort: failures are logged, never thrown (a missing WorkerW just leaves the window where
 *  it was). */
export async function applyOverlayLayer(layer: OverlayLayer): Promise<void> {
	const win = getCurrentWindow();
	let detail = '';
	let ok = true;
	try {
		if (layer === 'wallpaper') {
			await win.setAlwaysOnTop(false);
			await win.setAlwaysOnBottom(false);
			// The Rust command returns a human-readable status (e.g. "parented to WorkerW 0x…") so the
			// studio can show whether the wallpaper attach actually succeeded.
			detail = await invoke<string>('set_overlay_wallpaper', { enabled: true });
		} else {
			// Un-parent from any WorkerW first, then set the normal z-order. Idempotent when the
			// window was never parented (Rust SetParent to the desktop is a no-op there).
			await invoke('set_overlay_wallpaper', { enabled: false }).catch(() => undefined);
			if (layer === 'bottom') {
				await win.setAlwaysOnTop(false);
				await win.setAlwaysOnBottom(true);
				detail = 'below windows (always-on-bottom)';
			} else {
				await win.setAlwaysOnBottom(false);
				await win.setAlwaysOnTop(true);
				detail = 'always on top';
			}
		}
	} catch (err) {
		ok = false;
		detail = String(err);
		console.warn('applyOverlayLayer failed', layer, err);
	}
	// Surface the result: log to this window's console + broadcast so the studio Settings can show it
	// (cross-window verification — "is the wallpaper/below mode actually applied on the overlay?").
	console.info(`[overlay] layer '${layer}' on ${win.label}: ${ok ? 'OK' : 'FAILED'} — ${detail}`);
	emit('overlay_layer_status', { layer, ok, detail, label: win.label }).catch(() => undefined);
}

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
		if (visible) {
			await win.show();
			// show() raises the window to the top of its z-order, so re-assert the chosen layer AFTER
			// it — otherwise 'bottom'/'wallpaper' don't stick on startup (the overlay sits on top until
			// some other window gets activated). Tauri's always-on-bottom is a one-shot HWND_BOTTOM.
			await applyOverlayLayer(readOverlayPrefs().overlayLayer);
		} else {
			await win.hide();
		}
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

// Guard so repeat fillPrimaryMonitor() calls don't stack duplicate onScaleChanged listeners.
let scaleListenerWired = false;

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
		// #13: other always-on-top windows can silently steal topmost; re-assert the chosen z-order
		// layer here (also re-runs on scale change, so the layer survives a DPI hot-plug).
		await applyOverlayLayer(readOverlayPrefs().overlayLayer);
	} catch (err) {
		console.warn('setDecorations/setShadow/overlay layer failed', err);
	}
	// #12: DPI/scale hot-plug. When the primary monitor's scale factor changes at runtime
	// (resolution/scale change, or this window moving to a differently-scaled display), the
	// physical position/size must be recomputed against the now-primary monitor and the
	// borderless/topmost state re-asserted. Registered once (guarded) so repeated
	// fillPrimaryMonitor() calls don't stack listeners. Scale-change only — physical monitor
	// add/remove is out of scope here (handled by reconcileOverlays on layout change).
	if (!scaleListenerWired) {
		scaleListenerWired = true;
		try {
			await win.onScaleChanged(() => {
				fillPrimaryMonitor().catch((err) =>
					console.warn('fillPrimaryMonitor on scale change failed', err)
				);
			});
		} catch (err) {
			console.warn('onScaleChanged registration failed', err);
			scaleListenerWired = false; // allow a retry on a later fill
		}
	}
}

/** Whole-window click-through: true = clicks pass through (passive overlay). */
export async function setClickThrough(enabled: boolean): Promise<void> {
	await getCurrentWindow().setIgnoreCursorEvents(enabled);
}

/** Read the saved control remaps (`controls.json`), or null if none/failed. The frontend validates
 * the JSON via core/controls.ts `parseControlOverrides`; this is just the Tauri I/O edge. */
export async function loadControls(): Promise<string | null> {
	try {
		return await invoke<string | null>('load_controls');
	} catch (err) {
		console.warn('load_controls failed', err);
		return null;
	}
}

/** Persist the control remaps JSON (`{ version, overrides }`). */
export async function saveControls(contents: string): Promise<void> {
	try {
		await invoke('save_controls', { contents });
	} catch (err) {
		console.warn('save_controls failed', err);
	}
}

// ---- landing zones: zone WIDGETS (widgets.json) + foreign-window manipulation (windowmgr.rs) ----

/** Read the saved layout (`widgets.json`) raw JSON, or null if none/failed. The overlay's
 * DragSnapLayer parses it (core/migration.ts) to find `zone` widgets. Same file the layout uses. */
export async function loadLayoutRaw(): Promise<string | null> {
	try {
		return await invoke<string | null>('load_layout');
	} catch (err) {
		console.warn('load_layout failed', err);
		return null;
	}
}

/** Enumerate the arrangeable foreign top-level windows (for on-demand auto-arrange). Studio-only on
 * the backend; returns [] off-Windows or on failure so the caller never throws. */
export async function listWindows(): Promise<WindowDescriptor[]> {
	try {
		return await invoke<WindowDescriptor[]>('list_windows');
	} catch (err) {
		console.warn('list_windows failed', err);
		return [];
	}
}

/** Snap the foreign window `hwnd` so its visible frame fills `rect` (PHYSICAL px). Returns whether
 * it succeeded — a false result (elevated target the backend can't touch, or off-Windows) is
 * surfaced for an in-UI notice rather than thrown. Studio-only on the backend. */
export async function snapWindow(hwnd: number, rect: Rect): Promise<boolean> {
	try {
		await invoke('snap_window', { hwnd, rect });
		return true;
	} catch (err) {
		console.warn('snap_window failed', err);
		return false;
	}
}

/** Cursor position (PHYSICAL px) + whether Shift is held — polled by the overlay during a foreign
 * window drag to highlight the hovered zone (windowmgr.rs `pointer_probe`). Falls back to a
 * not-armed origin off-Windows / on failure so the poll loop never throws. */
export async function pointerProbe(): Promise<{ x: number; y: number; shift: boolean }> {
	try {
		return await invoke<{ x: number; y: number; shift: boolean }>('pointer_probe');
	} catch (err) {
		console.warn('pointer_probe failed', err);
		return { x: 0, y: 0, shift: false };
	}
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

/** The CSS of a USER theme `name` (empty for '(default)' / a missing theme). Disk-backed. */
export async function loadThemeCss(name: string): Promise<string> {
	if (!name) return '';
	try {
		return (await invoke<string | null>('load_theme', { name })) ?? '';
	} catch (err) {
		console.warn('load_theme failed', err);
		return '';
	}
}

/** The CSS for any selected theme: a `builtin:<id>` preset resolves synchronously from the in-app
 * registry (no disk), anything else is a user theme loaded from `themes/<name>.css`. '' = default. */
export async function resolveThemeCss(name: string): Promise<string> {
	if (!name) return '';
	const built = builtinCss(name);
	if (built != null) return built;
	return loadThemeCss(name);
}

/** Write theme `name` (a bare stem) → `themes/<name>.css`. Used by the studio theme editor. */
export async function saveThemeCss(name: string, contents: string): Promise<void> {
	try {
		await invoke('save_theme', { name, contents });
	} catch (err) {
		console.warn('save_theme failed', err);
	}
}

/** Delete theme `name` → removes `themes/<name>.css` (idempotent). Used by the studio theme list. */
export async function deleteThemeCss(name: string): Promise<void> {
	try {
		await invoke('delete_theme', { name });
	} catch (err) {
		console.warn('delete_theme failed', err);
	}
}

// ---- wallpapers: media files for the per-monitor background layer (in a fixed `wallpapers/` folder)

/** The media filenames available in the app-config `wallpapers/` folder (the Background picker). */
export async function listWallpapers(): Promise<string[]> {
	try {
		return await invoke<string[]>('list_wallpapers');
	} catch (err) {
		console.warn('list_wallpapers failed', err);
		return [];
	}
}

/** Resolve a wallpaper filename to an asset URL the webview can render (image/video `src`). */
export async function wallpaperAssetUrl(name: string): Promise<string> {
	try {
		const path = await invoke<string>('wallpaper_path', { name });
		return convertFileSrc(path);
	} catch (err) {
		console.warn('wallpaper_path failed', err);
		return '';
	}
}

/** Open the `wallpapers/` folder in Explorer so the user can drop media files in. */
export async function openWallpapersDir(): Promise<void> {
	try {
		await invoke('open_wallpapers_dir');
	} catch (err) {
		console.warn('open_wallpapers_dir failed', err);
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

/** The names of saved layout profiles (file stems of `layouts/*.layout.json`). */
export async function listLayouts(): Promise<string[]> {
	try {
		return await invoke<string[]>('list_layouts');
	} catch (err) {
		console.warn('list_layouts failed', err);
		return [];
	}
}

/** The raw JSON of saved layout `name`, or null if it doesn't exist / fails to read. */
export async function readLayout(name: string): Promise<string | null> {
	try {
		return await invoke<string | null>('read_layout', { name });
	} catch (err) {
		console.warn('read_layout failed', err);
		return null;
	}
}

/** Save the current monitor's layout as profile `name`; returns the path written (or null). */
export async function saveLayoutAs(name: string, contents: string): Promise<string | null> {
	try {
		return await invoke<string>('save_layout_as', { name, contents });
	} catch (err) {
		console.warn('save_layout_as failed', err);
		return null;
	}
}

/** Delete saved layout `name` (idempotent). Returns true on success. */
export async function deleteLayout(name: string): Promise<boolean> {
	try {
		await invoke('delete_layout', { name });
		return true;
	} catch (err) {
		console.warn('delete_layout failed', err);
		return false;
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

// --- launch at login (tauri-plugin-autostart) ---
// The plugin is registered in main.rs; its commands are granted in capabilities/overlay.json. We
// invoke them directly (no JS package) so there's no extra dependency. All resolve gracefully off-
// Windows / when the plugin is unavailable, so the Settings toggle never throws.

/** Whether the app is registered to launch at login. */
export async function isAutostartEnabled(): Promise<boolean> {
	try {
		return await invoke<boolean>('plugin:autostart|is_enabled');
	} catch (err) {
		console.warn('autostart is_enabled failed', err);
		return false;
	}
}

/** Enable/disable launch at login; returns the resulting (re-read) state. */
export async function setAutostart(enabled: boolean): Promise<boolean> {
	try {
		await invoke(enabled ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
	} catch (err) {
		console.warn('autostart toggle failed', err);
	}
	return isAutostartEnabled();
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

/**
 * Guard the studio window's close: intercept the OS close request and ask the caller's `decide`
 * what to do (typically prompt to save / discard / keep editing the unsaved changes — the studio
 * live-previews edits to disk, so closing without a decision would silently keep them). `decide`
 * resolves to `true` to proceed with the close or `false` to keep the window open; it should have
 * already saved/discarded as chosen. No-op off the studio window / outside Tauri. Returns an unlisten fn.
 */
export async function onStudioCloseRequested(
	decide: () => Promise<boolean> | boolean
): Promise<() => void> {
	if (!isStudioWindow()) return () => undefined;
	try {
		const win = getCurrentWindow();
		let closing = false;
		const unlisten = await win.onCloseRequested(async (event) => {
			if (closing) return; // second pass after our own close(): let it through
			event.preventDefault();
			let proceed = true;
			try {
				proceed = (await decide()) !== false;
			} catch (err) {
				// Never trap the user in a window we couldn't decide about — let the close proceed.
				console.warn('studio close decision failed', err);
			}
			if (!proceed) return; // keep the window open (preventDefault already applied)
			// Set the flag first so that even if close() rejects (e.g. a missing capability), a second
			// click on the OS close button falls straight through (the decision already ran either way).
			closing = true;
			try {
				await win.close();
			} catch (err) {
				console.warn('studio close failed', err);
			}
		});
		return unlisten;
	} catch (err) {
		console.warn('onStudioCloseRequested registration failed', err);
		return () => undefined;
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
	const [all, primary, friendlyByDevice] = await Promise.all([
		availableMonitors(),
		primaryMonitor(),
		displayNamesByDevice()
	]);
	return all.map((m, i) => {
		const isPrimary =
			!!primary && m.position.x === primary.position.x && m.position.y === primary.position.y;
		// Logical dimensions (physical / DPI scale) so the studio preview matches the overlay's
		// logical coordinate space; the zoom-to-fit then maps that onto the editor stage.
		const w = Math.round(m.size.width / m.scaleFactor);
		const h = Math.round(m.size.height / m.scaleFactor);
		// Identify by the OS device name (e.g. "\\.\DISPLAY3" → "DISPLAY3") + the monitor's
		// virtual-desktop position, NOT the arbitrary enumeration index — so the label names the
		// PHYSICAL monitor the layout drives (the DISPLAYn number usually matches Windows' own). The
		// Win32 backend supplies the friendly/EDID model name keyed on the same tag; it's appended to
		// the label when known (blank on non-Windows / virtual panels → the tag stands alone).
		const name = (m.name ?? '').replace(/^[\\.?]+/, '') || `Monitor ${i + 1}`;
		// Case-insensitive merge: GDI device names are uppercase on both sides today, but normalizing the
		// lookup key guards against the friendly name silently vanishing if either source ever differs.
		const friendly = friendlyByDevice.get(name.toUpperCase()) ?? '';
		return {
			key: isPrimary ? 'default' : String(i),
			label: monitorOptionLabel({
				device: name,
				friendly,
				isPrimary,
				w,
				h,
				x: m.position.x,
				y: m.position.y
			}),
			name,
			w,
			h
		};
	});
}

/** Friendly monitor names from the Win32 backend (`list_display_names`), keyed by the stripped GDI
 * device tag (DISPLAYn) so it lines up with `studioMonitorOptions`' own `name`. Returns an empty Map on
 * non-Windows / a plain browser / tests, or if the command is unavailable — callers fall back to the
 * device tag alone. */
async function displayNamesByDevice(): Promise<Map<string, string>> {
	try {
		const list = (await invoke<{ gdi: string; friendly: string }[]>('list_display_names')) ?? [];
		return new Map(
			list.map((d) => [d.gdi.replace(/^[\\.?]+/, '').toUpperCase(), (d.friendly ?? '').trim()])
		);
	} catch {
		return new Map();
	}
}

/** Open (or focus) the studio window — a borderless, taskbar-present app window that edits the same
 * layout the overlays render (synced via widgets.json + live reload). `decorations:false` removes the
 * OS title bar; the studio draws its OWN themed title bar (drag region + window controls) so the chrome
 * matches the active theme instead of the platform's grey frame. */
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
		resizable: true,
		// No OS title bar — the in-app `.studio-bar` is the (themed) title bar (data-tauri-drag-region
		// moves the window; the min/max/close cluster calls the window-control adapters below).
		decorations: false,
		// Disable Tauri's OS-level drag-drop handler so the webview's own HTML5 drag-and-drop fires —
		// the studio needs it for the Inspector palette → canvas drop and Outline row reparenting.
		// (The app uses no OS file-drop, so nothing is lost by turning it off.)
		dragDropEnabled: false
	});
	w.once('tauri://error', (err) => console.warn('studio window error', err));
}

// --- custom title-bar window controls (the studio's borderless window) -----------------------------
// Tauri window API stays at this edge (AGENTS.md §5). All no-op gracefully off Tauri / in a plain
// browser so the studio shell still renders under the dev mock + Playwright.

/** Minimize the current window (title-bar `—`). */
export async function minimizeWindow(): Promise<void> {
	try {
		await getCurrentWindow().minimize();
	} catch (err) {
		console.warn('minimize failed', err);
	}
}

/** Toggle maximize / restore for the current window (title-bar `▢`, and drag-region double-click). */
export async function toggleMaximizeWindow(): Promise<void> {
	try {
		await getCurrentWindow().toggleMaximize();
	} catch (err) {
		console.warn('toggleMaximize failed', err);
	}
}

/** Request the current window to close (title-bar `✕`) — the close-requested guard still prompts on
 * unsaved changes (see onStudioCloseRequested). */
export async function closeWindow(): Promise<void> {
	try {
		await getCurrentWindow().close();
	} catch (err) {
		console.warn('close failed', err);
	}
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
	// The chosen z-order layer seeds each new overlay's initial flag; the secondary then self-applies
	// the full layer (incl. wallpaper, which must be invoked from its OWN webview) via its Canvas.
	const layer = readOverlayPrefs().overlayLayer;

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
			alwaysOnTop: layer === 'top',
			skipTaskbar: true,
			focus: false,
			visible: false,
			// Let HTML5 drag-and-drop work in edit mode (palette → canvas, Outline reparent); the app
			// uses no OS file-drop, so Tauri's native handler is safe to disable here too.
			dragDropEnabled: false
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
				// #13: seed the z-order after show (other always-on-top windows can steal topmost).
				// 'wallpaper' is NOT applied here — its Rust SetParent must run from the secondary's
				// own webview, so the secondary self-parents via its Canvas effect on mount.
				if (layer === 'bottom') {
					await w.setAlwaysOnTop(false);
					await w.setAlwaysOnBottom(true);
				} else if (layer === 'top') {
					await w.setAlwaysOnTop(true);
				}
				// #12: DPI/scale hot-plug. Re-fit this overlay to monitor `m` (captured) when its
				// scale factor changes at runtime. Scale-change only — physical monitor add/remove
				// is out of scope here (reconcileOverlays handles open/close on layout change).
				await w.onScaleChanged(() => {
					(async () => {
						await w.setPosition(new PhysicalPosition(m.position.x, m.position.y));
						await w.setSize(new PhysicalSize(m.size.width, m.size.height));
					})().catch((err) => console.warn('overlay re-fit on scale change failed', label, err));
				});
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
