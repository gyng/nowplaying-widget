// Maps a widget `type` to its Svelte component, and pairs the component layer with the
// framework-agnostic metas in core/widget.ts. `registerWidget` is the plugin entry point
// (Phase 8): register a meta + its component in one call. The built-in metas are
// registered by core/widget on load; this attaches their components.

import type { SvelteComponent } from 'svelte';
import { getMeta, listMetas, registerMeta, type WidgetMeta } from '../core/widget';
import Gauge from './meters/Gauge.svelte';
import Sparkline from './meters/Sparkline.svelte';
import Text from './meters/Text.svelte';
import Clock from './meters/Clock.svelte';
import Bar from './meters/Bar.svelte';
import Button from './meters/Button.svelte';
import NowPlaying from './meters/NowPlaying.svelte';
import Cpu from './meters/Cpu.svelte';

export type MeterComponent = typeof SvelteComponent;

const components: Record<string, MeterComponent> = {
	gauge: Gauge as unknown as MeterComponent,
	sparkline: Sparkline as unknown as MeterComponent,
	text: Text as unknown as MeterComponent,
	clock: Clock as unknown as MeterComponent,
	bar: Bar as unknown as MeterComponent,
	button: Button as unknown as MeterComponent,
	nowplaying: NowPlaying as unknown as MeterComponent,
	cpu: Cpu as unknown as MeterComponent
};

/** Back-compat alias used by WidgetHost (`registry[instance.type]`). */
export const registry = components;

/** Register a plugin widget: its meta (defaults + config schema) + its component. */
export function registerWidget(meta: WidgetMeta, component: MeterComponent): void {
	registerMeta(meta);
	components[meta.type] = component;
}

/** Palette items (registered metas that have a component), in registration order. */
export function paletteItems(): { type: string; label: string }[] {
	return listMetas()
		.filter((m) => components[m.type])
		.map((m) => ({ type: m.type, label: m.label ?? m.type }));
}

export { getMeta };
