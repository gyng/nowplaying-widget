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
import type { MacroAction } from '../core/macro';
import type { MonitorLayout } from '../core/layoutTree';
import type { AssistantOp } from '../core/llm';
import { registerWidget, type MeterComponent } from './registry';

export type PluginWidget = { meta: WidgetMeta; component: MeterComponent };

/** A control-action handler a plugin contributes: Canvas's universal control sink looks the
 * action's `domain` up here instead of baking in per-plugin dispatch. `domain: '*'` is the
 * catch-all (Home Assistant claims it — every non-media bang is an HA service call, the
 * pre-registry behavior). `ctx.sensor` is the firing widget's bound sensor id, for handlers
 * that derive a target from it (HA's `ha.<entity>` fallback). May throw/reject on failure so
 * a macro run can record the failed step. */
export type ActionHandler = {
	domain: string;
	dispatch: (action: MacroAction, ctx: { sensor?: string }) => void | Promise<void>;
};

export type StudioApplyResult = { applied: number; addedIds: string[]; errors: string[] };

/** The studio surface Canvas hands to `Plugin.studio` hooks (studio window only): read the
 * current monitor layout and apply assistant ops to the live editor as one undo step. */
export type StudioApi = {
	monitor(): MonitorLayout;
	apply(ops: AssistantOp[]): StudioApplyResult;
};

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
	// Control-action handlers keyed by domain ('*' = catch-all); see ActionHandler.
	actions?: ActionHandler[];
	// Studio hook: called with the StudioApi when the studio canvas mounts (and re-called as the
	// layout changes, after the previous cleanup); return a cleanup to drop any stashed api.
	studio?: (api: StudioApi) => void | (() => void);
	// A text status sensor id (e.g. 'ha.status') the Plugins list reads for its colored dot;
	// values follow the ha.rs convention (connected/connecting/error/disconnected) plus
	// configured/unconfigured for command-derived statuses — see statusDotFrom.
	statusSensor?: string;
};

const plugins = new Map<string, Plugin>();
const actionHandlers = new Map<string, ActionHandler['dispatch']>();

export function registerPlugin(plugin: Plugin): void {
	plugins.set(plugin.id, plugin);
	// A plugin's widgets group under the plugin's name in the Add palette unless the meta says
	// otherwise — so "HA Light" lands under "Home Assistant", not in an uncategorized tail.
	plugin.widgets?.forEach((w) => registerWidget({ category: plugin.name, ...w.meta }, w.component));
	plugin.sources?.forEach(registerSource);
	plugin.controls?.forEach(registerControl);
	plugin.actions?.forEach((a) => actionHandlers.set(a.domain, a.dispatch));
}

/** The dispatch for `domain`: an exact registration, else the '*' catch-all, else null. */
export function actionHandlerFor(domain: string): ActionHandler['dispatch'] | null {
	return actionHandlers.get(domain) ?? actionHandlers.get('*') ?? null;
}

export type PluginDotState = 'ok' | 'warn' | 'off';

/** Pure status-text → list-dot mapping (a superset of core/haStatus's badge cases, plus the
 * configured/unconfigured pair for plugins whose status comes from a config command rather than
 * a live connection). Unknown/absent → 'off' ("Not connected"), matching haStatusBadge. */
export function statusDotFrom(raw: string | null | undefined): {
	state: PluginDotState;
	label: string;
} {
	switch (raw) {
		case 'connected':
			return { state: 'ok', label: 'Connected' };
		case 'configured':
			return { state: 'ok', label: 'Configured' };
		case 'connecting':
			return { state: 'warn', label: 'Connecting…' };
		case 'error':
			return { state: 'warn', label: 'Error' };
		case 'disconnected':
			return { state: 'off', label: 'Disconnected' };
		case 'unconfigured':
			return { state: 'off', label: 'Not configured' };
		default:
			return { state: 'off', label: 'Not connected' };
	}
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
