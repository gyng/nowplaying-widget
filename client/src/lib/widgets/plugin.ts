// The plugin assembly point (Phase 8b). A `Plugin` bundles widgets (a meta + its Svelte
// component) and/or data sources; `registerPlugin` wires them into the registries. Lives in
// the widgets layer because widgets carry Svelte components (the source half is core). A
// build-time plugin is a module that calls `registerPlugin({...})` at import — see the
// Home Assistant plugin (8c).

import { registerSource, type SensorSource } from '../core/plugin';
import type { WidgetMeta } from '../core/widget';
import { registerWidget, type MeterComponent } from './registry';

export type PluginWidget = { meta: WidgetMeta; component: MeterComponent };

export type Plugin = {
	id: string;
	name: string;
	widgets?: PluginWidget[];
	sources?: SensorSource[];
};

export function registerPlugin(plugin: Plugin): void {
	plugin.widgets?.forEach((w) => registerWidget(w.meta, w.component));
	plugin.sources?.forEach(registerSource);
}
