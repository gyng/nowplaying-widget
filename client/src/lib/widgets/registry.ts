// Maps a widget `type` string to its presentational component. Adding a meter =
// add a component and one entry here; instances reference it by `type`.

import type { SvelteComponent } from 'svelte';
import Gauge from './meters/Gauge.svelte';
import Sparkline from './meters/Sparkline.svelte';

export type MeterComponent = typeof SvelteComponent;

export const registry: Record<string, MeterComponent> = {
	gauge: Gauge as unknown as MeterComponent,
	sparkline: Sparkline as unknown as MeterComponent
};
