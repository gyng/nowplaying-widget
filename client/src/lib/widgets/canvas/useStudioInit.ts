// Init is NON-IDEMPOTENT (item 4): on mount run updateWorkArea + startAllSources(hub) + reloadLayout
// + listen(layout_changed/themes_changed/toggle_edit/open_studio) + (primary) fill/reconcile. The
// cleanup MUST call every UnlistenFn + the source stop + clearPreviewWrite. A `cancelled` flag
// guards the async unsubscribe-after-unmount race. Assumes NO React.StrictMode — this runs once.
// Ported verbatim from the Svelte onMount/onDestroy pair (same Tauri event/command strings).
import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { startAllSources } from '../../core/plugin';
import type { TelemetryHub } from '../../core/telemetry';
import {
	fillPrimaryMonitor,
	listThemes,
	monitorParam,
	openStudio,
	setMainWindowVisible,
	studioMonitorOptions
} from '../../overlay';
import type { MonitorOption } from './types';

export type StudioInitDeps = {
	studio: boolean;
	hub: TelemetryHub;
	updateWorkArea: () => Promise<void>;
	reloadLayout: () => Promise<void>;
	reloadControls: () => Promise<void>; // load control remaps (startup + controls_changed)
	editMode: () => boolean; // for the layout_changed guard
	syncRects: () => void;
	syncPrimaryOverlays: () => Promise<void>;
	applyTheme: () => Promise<void>;
	setThemeList: (t: string[]) => void;
	setEdit: (v: boolean) => void;
	setEditModeImmediate: () => void; // studio: editMode = true (no click-through round-trip)
	setMonitorOptions: (o: MonitorOption[]) => void;
	clearPreviewWrite: () => void;
};

export function useStudioInit(deps: StudioInitDeps): void {
	// Hold deps in a ref so the mount effect reads the latest callbacks without re-running.
	const d = useRef(deps);
	d.current = deps;

	useEffect(() => {
		let cancelled = false;
		let sourceStop: (() => void) | undefined;
		let unlistenLayout: UnlistenFn | undefined;
		let unlistenControls: UnlistenFn | undefined;
		let unlistenThemes: UnlistenFn | undefined;
		let unlistenStudio: UnlistenFn | undefined;
		let unlistenEdit: UnlistenFn | undefined;

		(async () => {
			const dep = d.current;
			await dep.updateWorkArea();
			sourceStop = await startAllSources(dep.hub); // built-in `system` + any plugin sources
			if (cancelled) {
				sourceStop?.();
				return;
			}
			await dep.reloadLayout();

			// Control remaps (controls.json): load once, then live-reload on external edits or a save
			// from another window. Always applied (not gated by editMode) — a remap should take effect
			// immediately everywhere.
			await dep.reloadControls();
			unlistenControls = await listen('controls_changed', () => d.current.reloadControls());

			// Live-reload external edits to widgets.json (ignored while actively editing). On the
			// primary main window, also reconcile overlays + own visibility as monitors gain/lose widgets.
			unlistenLayout = await listen('layout_changed', () => {
				if (d.current.editMode()) return;
				d.current.reloadLayout().then(() => {
					d.current.syncRects();
					if (!monitorParam()) d.current.syncPrimaryOverlays();
				});
			});
			if (cancelled) {
				unlistenControls?.();
				unlistenLayout?.();
				return;
			}

			// Themes: list them + live-reload the active theme when the folder changes.
			const themes = await listThemes();
			if (cancelled) {
				unlistenControls?.();
				unlistenLayout?.();
				return;
			}
			d.current.setThemeList(themes);
			unlistenThemes = await listen('themes_changed', () => {
				d.current.applyTheme();
				listThemes().then((t) => d.current.setThemeList(t));
			});
			if (cancelled) {
				unlistenControls?.();
				unlistenLayout?.();
				unlistenThemes?.();
				return;
			}

			if (dep.studio) {
				dep.setEditModeImmediate(); // the studio is always an editor; no overlay fill/click-through
				const opts = await studioMonitorOptions();
				if (cancelled) {
					unlistenControls?.();
					unlistenLayout?.();
					unlistenThemes?.();
					return;
				}
				d.current.setMonitorOptions(opts);
				return;
			}

			// The main window covers the PRIMARY monitor (rendering the `default` key) and opens
			// overlays on every other monitor.
			if (!monitorParam()) {
				await fillPrimaryMonitor();
				await dep.syncPrimaryOverlays();
				unlistenStudio = await listen('open_studio', () => openStudio());
			}
			if (cancelled) {
				unlistenControls?.();
				unlistenLayout?.();
				unlistenThemes?.();
				unlistenStudio?.();
				return;
			}
			// Initial whole-window click-through is established by Canvas's presentation effect (so the
			// main overlay starts interactive and a secondary starts click-through); here we only seed the
			// per-widget interactive rects for a passive overlay.
			d.current.syncRects();
			unlistenEdit = await listen('toggle_edit', () => d.current.setEdit(!d.current.editMode()));
			if (cancelled) {
				unlistenControls?.();
				unlistenLayout?.();
				unlistenThemes?.();
				unlistenStudio?.();
				unlistenEdit?.();
			}
		})().catch((err) => {
			// The primary main window is born hidden (config `visible:false`) and only revealed once
			// init reaches `syncPrimaryOverlays`. If init throws before that, reveal it anyway so a
			// failure can never strand the app permanently invisible (its old always-visible default).
			console.warn('overlay init failed', err);
			if (!cancelled && !d.current.studio && !monitorParam()) {
				void setMainWindowVisible(true).catch(() => undefined);
			}
		});

		return () => {
			cancelled = true;
			sourceStop?.();
			unlistenControls?.();
			unlistenLayout?.();
			unlistenThemes?.();
			unlistenStudio?.();
			unlistenEdit?.();
			d.current.clearPreviewWrite();
		};
		// Run once on mount (non-idempotent). eslint-disable to keep the empty dep list intentional.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
}
