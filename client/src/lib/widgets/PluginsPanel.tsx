// Plugins section (extracted from Canvas): the registered-plugin list (with live status dots) +
// the selected plugin's detail/settings pane. Which plugin is selected stays Canvas state (it
// survives section switches); everything else — the failed-registration rows, the settings panel
// behind its ErrorBoundary, the sources/widget-types fallback — renders here. Lazy-loaded like
// the other studio panels, so the overlay never fetches it.
import { useMemo } from 'react';
import type { TelemetryHub } from '../core/telemetry';
import { statusDotFrom, type Plugin } from './plugin';
import { pluginLoadErrors } from './plugins';
import ErrorBoundary from './ErrorBoundary';
import SensorList from './SensorList';
import { useSensor } from './useSensor';

type Props = {
	hub: TelemetryHub;
	plugins: Plugin[];
	selectedId: string | null;
	onSelect: (id: string) => void;
};

// One Plugins-list status dot: subscribes to the plugin's declared status sensor (the same
// `*.status` text samples the detail panels read) and renders an ok/warn/off dot. A component
// (not inline JSX) so the useSensor hook count stays constant per list row.
function PluginStatusDot({ hub, sensor }: { hub: TelemetryHub; sensor?: string }) {
	const state = useSensor(hub, sensor ?? '__none__');
	if (!sensor) return null;
	const dot = statusDotFrom(state.value?.kind === 'text' ? state.value.value : null);
	return (
		<span className={`pl-dot pl-dot--${dot.state}`} title={dot.label} aria-label={dot.label} />
	);
}

export default function PluginsPanel({ hub, plugins, selectedId, onSelect }: Props) {
	const selectedPlugin = useMemo(
		() => plugins.find((p) => p.id === selectedId) ?? null,
		[plugins, selectedId]
	);
	// Capitalized so it can be used as a JSX element when the plugin ships a settings panel.
	const SelectedPluginSettings = selectedPlugin?.settings ?? null;
	return (
		<div className="rail-panel plugins-panel">
			<div className="pl-list">
				<div className="rp-hd">Plugins</div>
				{plugins.length ? (
					plugins.map((p) => (
						<button
							key={p.id}
							type="button"
							className={['pl-item', p.id === selectedId && 'cur'].filter(Boolean).join(' ')}
							onClick={() => onSelect(p.id)}
						>
							<PluginStatusDot hub={hub} sensor={p.statusSensor} />
							{p.name}
						</button>
					))
				) : (
					<div className="rp-stub">No plugins registered.</div>
				)}
				{/* Plugins whose registration threw (registerBuiltinPlugins caught it):
				    they never reach pluginList, so list them as inert warn rows. */}
				{pluginLoadErrors().map((e) => (
					<div key={e.id} className="pl-item pl-failed" title={e.error}>
						<span className="pl-dot pl-dot--warn" aria-label="Failed to load" />
						{e.name} <span className="dim">failed to load</span>
					</div>
				))}
			</div>
			<div className="pl-detail">
				{!selectedPlugin ? (
					<div className="rp-stub">Select a plugin to view its settings.</div>
				) : (
					<>
						<div className="pl-title">{selectedPlugin.name}</div>
						{selectedPlugin.description && (
							<div className="pl-desc">{selectedPlugin.description}</div>
						)}
						{SelectedPluginSettings ? (
							// Keyed by plugin so a healthy panel never inherits a stale crash
							// state; a throwing panel degrades to an inline error, not a blank
							// studio rail.
							<ErrorBoundary key={selectedPlugin.id} label={`${selectedPlugin.name} settings`}>
								<SelectedPluginSettings />
							</ErrorBoundary>
						) : (
							<>
								{!!selectedPlugin.sources?.length && (
									<>
										<div className="rp-hd">Sources</div>
										{selectedPlugin.sources.map((s) => {
											const ids = s.catalog?.() ?? [];
											return (
												<div key={s.id} className="pl-source">
													<div className="rp-row">
														<span>{s.id}</span>
														<span className="dim">{ids.length} sensors</span>
													</div>
													{ids.length > 0 && <SensorList hub={hub} ids={ids} />}
												</div>
											);
										})}
									</>
								)}
								{!!selectedPlugin.widgets?.length && (
									<>
										<div className="rp-hd">Widget types</div>
										<div className="rp-list">
											{selectedPlugin.widgets.map((w) => (
												<div key={w.meta.type} className="rp-row">
													<span>{w.meta.label ?? w.meta.type}</span>
													<span className="dim">{w.meta.type}</span>
												</div>
											))}
										</div>
									</>
								)}
								{!selectedPlugin.sources?.length && !selectedPlugin.widgets?.length && (
									<div className="rp-stub">This plugin has no configurable settings.</div>
								)}
							</>
						)}
					</>
				)}
			</div>
		</div>
	);
}
