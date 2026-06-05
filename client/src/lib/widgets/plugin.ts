// The plugin assembly point (Phase 8b). A `Plugin` bundles widgets (a meta + its React
// component), data sources, and/or a settings panel; `registerPlugin` wires them into the
// registries AND keeps the plugin itself so the studio's Plugins section can list them. Lives
// in the widgets layer because widgets carry React components + the settings panel (the source
// half is core). A build-time plugin is a module that calls `registerPlugin({...})` at import —
// see the Home Assistant (8c) and Now Playing plugins. Co-located vitest tests in plugin.test.tsx.

import type { ComponentType } from 'react';
import { registerSource, type SensorSource } from '../core/plugin';
import { registerControl, type Control } from '../core/controls';
import type { WidgetMeta } from '../core/widget';
import { registerWidget, type MeterComponent } from './registry';

export type PluginWidget = { meta: WidgetMeta; component: MeterComponent };

export type Plugin = {
	id: string;
	name: string;
	description?: string; // shown in the studio's Plugins detail pane
	widgets?: PluginWidget[];
	sources?: SensorSource[];
	// Optional settings panel (a props-less React component); the studio renders it when this
	// plugin is selected in the Plugins section. A plugin with no settings shows a summary instead.
	settings?: ComponentType;
	// Controls this plugin contributes (e.g. overlay shortcuts). They appear in the hint bar / Settings
	// → Controls when in scope; the handler is supplied by the host's handler map (same boundary as a
	// widget's onControl bubble-up). Namespace ids as `plugin:<id>.<name>` to avoid collisions.
	controls?: Control[];
};

const plugins = new Map<string, Plugin>();

export function registerPlugin(plugin: Plugin): void {
	plugins.set(plugin.id, plugin);
	plugin.widgets?.forEach((w) => registerWidget(w.meta, w.component));
	plugin.sources?.forEach(registerSource);
	plugin.controls?.forEach(registerControl);
}

/** Every registered plugin, in registration order (for the studio's Plugins list). */
export function listPlugins(): Plugin[] {
	return Array.from(plugins.values());
}

/** Map each sensor id contributed by a plugin's source(s) to that plugin's display name — for a
 * "from X" badge in the sensor browser. Pure over the given plugins. The built-in `system` source is
 * registered directly (not via a plugin), so system sensors are absent here → no badge. First plugin
 * to claim an id wins. */
export function pluginSensorNamesFrom(list: Plugin[]): Map<string, string> {
	const names = new Map<string, string>();
	for (const p of list) {
		for (const source of p.sources ?? []) {
			for (const id of source.catalog?.() ?? []) if (!names.has(id)) names.set(id, p.name);
		}
	}
	return names;
}

/** `pluginSensorNamesFrom` over the live plugin registry. */
export function pluginSensorNames(): Map<string, string> {
	return pluginSensorNamesFrom(listPlugins());
}
