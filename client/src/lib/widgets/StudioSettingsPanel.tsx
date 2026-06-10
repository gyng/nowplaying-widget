// Settings section (extracted from Canvas): the side tab list + one focused subsection at a time
// (Display / Overlay / Startup / Controls / Diagnostics / About / Danger zone). Purely a panel —
// the prefs/handlers it surfaces stay owned by Canvas and arrive as grouped props; the only module
// calls it makes itself are the stateless overlay helpers (devtools / rescue / clipboard). Lazy-
// loaded like the other studio panels (Canvas's lazy() block), so the overlay never fetches it.
import type { Rect } from '../core/layout';
import type { ControlOverrides, Trigger } from '../core/controls';
import type { OverlayLayer, OverlayPrefs } from './canvas/overlayPrefs';
import { copyToClipboard, openDevtools, rescueWindows } from '../overlay';
import ControlsPanel from './ControlsPanel';
import DiagnosticsPanel from './DiagnosticsPanel';
import mascotUrl from '../../assets/mascot.png';

// Settings subsections — a side list (mirrors the Plugins list+detail split) so the pane shows one
// focused topic at a time (progressive disclosure / chunking) instead of one long scroll, and each
// subsection carries a title + one-line purpose for orientation. Ordered safe → informational →
// destructive; 'danger' is set apart and coloured (error prevention).
export const SETTINGS_TABS = [
	{ id: 'display', label: 'Display' },
	{ id: 'overlay', label: 'Overlay' },
	{ id: 'startup', label: 'Startup' },
	{ id: 'controls', label: 'Controls' },
	{ id: 'diagnostics', label: 'Diagnostics' },
	{ id: 'about', label: 'About' },
	{ id: 'danger', label: 'Danger zone' }
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

type Props = {
	tab: SettingsTab;
	onTab: (tab: SettingsTab) => void;
	// Display: the monitor this layout drives + the stage view.
	display: {
		monName: string;
		monSize: { w: number; h: number };
		workArea: Rect;
		multiMonitor: boolean;
		zoom: number;
		fit: () => void;
	};
	// Overlay: z-order/taskbar prefs + the overlays' last layer-apply status line.
	overlay: {
		prefs: OverlayPrefs;
		setPrefs: (patch: Partial<OverlayPrefs>) => void;
		layerStatus: string;
	};
	startup: { autostart: boolean; toggleAutostart: (enabled: boolean) => void };
	// Controls: pass-through props for ControlsPanel (the remap state lives in useControls).
	controls: {
		overrides: ControlOverrides;
		onRebind: (id: string, trigger: Trigger) => void;
		onReset: (id: string) => void;
		onResetAll: () => void;
	};
	appVersion: string | null;
	clearMonitor: () => void;
};

export default function StudioSettingsPanel({
	tab,
	onTab,
	display,
	overlay,
	startup,
	controls,
	appVersion,
	clearMonitor
}: Props) {
	const { monName, monSize, workArea, multiMonitor, zoom, fit } = display;
	const { prefs: overlayPrefs, setPrefs: setOverlayPrefs, layerStatus } = overlay;
	return (
		<div className="rail-panel plugins-panel settings-panel">
			<div className="pl-list">
				<div className="rp-hd">Settings</div>
				{SETTINGS_TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						className={['pl-item', t.id === tab && 'cur', t.id === 'danger' && 'set-danger']
							.filter(Boolean)
							.join(' ')}
						onClick={() => onTab(t.id)}
					>
						{t.label}
					</button>
				))}
			</div>
			<div className="pl-detail">
				{tab === 'display' && (
					<>
						<div className="pl-title">Display</div>
						<div className="pl-desc">
							The monitor this layout drives — each monitor keeps its own layout.
						</div>
						<div className="rp-hd">
							{monName || '—'} · {monSize.w}×{monSize.h}
						</div>
						<div className="rp-list">
							<div className="rp-row">
								<span>work area</span>
								<span className="dim">
									{Math.round(workArea.w)}×{Math.round(workArea.h)}
								</span>
							</div>
						</div>
						{multiMonitor && (
							<div className="rp-stub">
								Move a widget to another monitor by right-clicking it → “Move to”.
							</div>
						)}
						<div className="rp-hd">View</div>
						<button type="button" onClick={fit}>
							⤢ Fit to screen ({Math.round(zoom * 100)}%)
						</button>
					</>
				)}
				{tab === 'overlay' && (
					<>
						<div className="pl-title">Overlay</div>
						<div className="pl-desc">
							How the transparent overlay sits on the desktop (z-order + taskbar).
						</div>
						<label className="rp-row" style={{ cursor: 'pointer' }}>
							<span>respect taskbar (work area)</span>
							<input
								type="checkbox"
								checked={overlayPrefs.respectWorkArea}
								onChange={(e) => setOverlayPrefs({ respectWorkArea: e.currentTarget.checked })}
							/>
						</label>
						<label style={{ display: 'block', marginTop: 8 }}>
							<span>window layer</span>
							<select
								value={overlayPrefs.overlayLayer}
								onChange={(e) =>
									setOverlayPrefs({
										overlayLayer: e.currentTarget.value as OverlayLayer
									})
								}
							>
								<option value="bottom">Below windows (default)</option>
								<option value="top">Always on top</option>
								<option value="wallpaper">Wallpaper layer (WorkerW · experimental)</option>
							</select>
						</label>
						<div className="pl-desc">
							“Below windows” sits behind apps (above desktop icons; Show Desktop hides it).
							“Wallpaper layer” parents the overlay to the desktop so it renders behind the icons —
							experimental, Windows-only, takes effect on the live overlay.
						</div>
						<div className="pl-desc" style={{ marginTop: 6 }}>
							Overlay status:{' '}
							<code>{layerStatus || '(waiting for the overlay to apply a layer…)'}</code>
						</div>
						<div className="rp-hd" style={{ marginTop: 12 }}>
							Debug
						</div>
						<label className="rp-row" style={{ cursor: 'pointer' }}>
							<span>windowed mode</span>
							<input
								type="checkbox"
								checked={overlayPrefs.debugWindowed}
								onChange={(e) => setOverlayPrefs({ debugWindowed: e.currentTarget.checked })}
							/>
						</label>
						<div className="pl-desc">
							Render overlays as ordinary decorated, interactive, alt-tab-able windows (opaque,
							taskbar-present, not click-through), so a crashing or misbehaving overlay is visible,
							clickable (its “Reload” page), and inspectable — the borderless click-through overlay
							otherwise hides all of that. Takes effect on the live overlay.
						</div>
						<div className="pl-desc" style={{ marginTop: 6 }}>
							Stuck behind a click-through window? Press <code>Ctrl+Alt+Shift+E</code> anytime — the
							rescue hotkey forces every window interactive (works even if its webview crashed).
						</div>
					</>
				)}
				{tab === 'startup' && (
					<>
						<div className="pl-title">Startup</div>
						<div className="pl-desc">What happens when you sign in to Windows.</div>
						<label className="rp-row" style={{ cursor: 'pointer' }}>
							<span>launch at login</span>
							<input
								type="checkbox"
								checked={startup.autostart}
								onChange={(e) => startup.toggleAutostart(e.currentTarget.checked)}
							/>
						</label>
					</>
				)}
				{tab === 'controls' && (
					<>
						<div className="pl-title">Controls</div>
						<div className="pl-desc">
							Rebind the keyboard shortcuts that drive the studio and overlays.
						</div>
						<ControlsPanel
							overrides={controls.overrides}
							onRebind={controls.onRebind}
							onReset={controls.onReset}
							onResetAll={controls.onResetAll}
						/>
					</>
				)}
				{tab === 'diagnostics' && (
					<>
						<div className="pl-title">Diagnostics</div>
						<div className="pl-desc">
							Inspect the studio and overlays — JS heap, retained media, per-widget DOM weight, and
							devtools.
						</div>
						<button type="button" onClick={openDevtools}>
							⌗ Inspect this window (devtools)
						</button>
						<button
							type="button"
							onClick={() => void rescueWindows()}
							title="Make every window interactive and bring it forward — recovers a click-through or crashed overlay you can't click (same as the Ctrl+Alt+Shift+E hotkey)."
						>
							⛑ Rescue all windows
						</button>
						<DiagnosticsPanel />
					</>
				)}
				{tab === 'about' && (
					<>
						<div className="about-hd">
							<img
								className="about-mascot"
								src={mascotUrl}
								alt="widgetsack mascot: a beckoning cat carrying a sack and a little CRT"
								width={88}
								height={88}
							/>
							<div className="pl-title">widgetsack</div>
						</div>
						<div className="pl-desc">
							A themeable desktop widget overlay for Windows — system meters, clocks, the
							now-playing track, and Home Assistant controls, arranged here in the studio.
						</div>
						<div className="rp-list">
							<div className="rp-row">
								<span>version</span>
								<span className="dim">{appVersion ?? '…'}</span>
							</div>
							<div className="rp-row">
								<span>license</span>
								<span className="dim">MIT OR Apache-2.0</span>
							</div>
						</div>
						<div className="rp-hd">Source</div>
						<div className="rp-row">
							<span className="set-repo">github.com/gyng/nowplaying-widget</span>
							<button
								type="button"
								onClick={() => {
									void copyToClipboard('https://github.com/gyng/nowplaying-widget');
								}}
							>
								copy
							</button>
						</div>
					</>
				)}
				{tab === 'danger' && (
					<>
						<div className="pl-title set-danger-title">Danger zone</div>
						<div className="pl-desc">
							Destructive actions for this monitor’s layout. There is no undo.
						</div>
						<button type="button" className="rp-danger" onClick={clearMonitor}>
							✕ Clear this monitor
						</button>
					</>
				)}
			</div>
		</div>
	);
}
